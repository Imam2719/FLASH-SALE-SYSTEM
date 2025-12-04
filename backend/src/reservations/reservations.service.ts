import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Reservation, ReservationStatus } from './entities/reservation.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ProductsService } from '../products/products.service';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private reservationsRepository: Repository<Reservation>,
    private productsService: ProductsService,
    @InjectQueue('reservations') private reservationQueue: Queue,
  ) {}

  /**
   * Create a new reservation with stock deduction
   * IMPORTANT: Uses database-level pessimistic locking to prevent race conditions
   */
  async create(
    createReservationDto: CreateReservationDto,
  ): Promise<Reservation> {
    const { productId, quantity } = createReservationDto;

    // Validate quantity
    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    // Get database connection for transactions
    const queryRunner =
      this.reservationsRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 🔒 CRITICAL: Lock the product row for update
      // This prevents race condition where multiple users can reserve the same stock
      const product = await queryRunner.manager
        .createQueryBuilder()
        .select('product')
        .from('products', 'product')
        .where('product.id = :id', { id: productId })
        .setLock('pessimistic_write') // ← DATABASE LOCK: Only one query can lock this at a time
        .setParameters({ id: productId })
        .getOne();

      if (!product) {
        await queryRunner.rollbackTransaction();
        throw new NotFoundException('Product not found');
      }

      // Check stock availability (now safe because row is locked)
      if (product.availableStock < quantity) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException(
          `Insufficient stock. Only ${product.availableStock} available`,
        );
      }

      // Deduct stock immediately (atomic operation)
      await queryRunner.manager
        .createQueryBuilder()
        .update('products')
        .set({ availableStock: () => 'availableStock - :quantity' })
        .where('id = :id', { id: productId })
        .setParameters({ quantity, id: productId })
        .execute();

      // Create reservation with 2-minute expiration
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 2);

      const reservation = this.reservationsRepository.create({
        productId,
        quantity,
        status: ReservationStatus.ACTIVE,
        expiresAt,
      });

      const savedReservation = await queryRunner.manager.save(reservation);

      // Commit transaction
      await queryRunner.commitTransaction();

      // Schedule background job for expiration (outside transaction)
      try {
        await this.reservationQueue.add(
          'expire-reservation',
          { reservationId: savedReservation.id },
          {
            delay: 2 * 60 * 1000, // 2 minutes in milliseconds
            removeOnComplete: true,
            removeOnFail: false,
            attempts: 3, // Retry 3 times if fails
            backoff: {
              type: 'exponential',
              delay: 2000, // Start with 2 second delay
            },
          },
        );
      } catch (jobError) {
        console.error(
          `⚠️  Failed to schedule expiration job for reservation ${savedReservation.id}:`,
          jobError.message,
        );
        // Don't fail the reservation creation if job scheduling fails
        // Cron job will handle it as fallback
      }

      console.log(
        `✅ Reservation ${savedReservation.id} created - expires at ${expiresAt.toLocaleTimeString()}`,
      );

      return savedReservation;
    } catch (error) {
      // Rollback on any error
      await queryRunner.rollbackTransaction();

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      console.error('❌ Error creating reservation:', error);
      throw new InternalServerErrorException(
        'Failed to create reservation. Please try again.',
      );
    } finally {
      // Always release the connection
      await queryRunner.release();
    }
  }

  /**
   * Complete a reservation (mock payment + status update)
   */
  async complete(id: string): Promise<Reservation> {
    const reservation = await this.reservationsRepository.findOne({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status !== ReservationStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot complete reservation. Current status: ${reservation.status}`,
      );
    }

    // Check if already expired
    const now = new Date();
    if (now > reservation.expiresAt) {
      // Double-check if status is still ACTIVE (might have been expired by job)
      const currentReservation = await this.reservationsRepository.findOne({
        where: { id },
      });

      if (currentReservation.status === ReservationStatus.ACTIVE) {
        // Mark as expired and restore stock
        currentReservation.status = ReservationStatus.EXPIRED;
        await this.reservationsRepository.save(currentReservation);
        await this.productsService.incrementStock(
          currentReservation.productId,
          currentReservation.quantity,
        );
      }

      throw new BadRequestException(
        'Reservation has expired. Stock has been restored.',
      );
    }

    // Complete the reservation (mock payment)
    reservation.status = ReservationStatus.COMPLETED;
    const completed = await this.reservationsRepository.save(reservation);

    console.log(`✅ Reservation ${id} completed successfully`);

    return completed;
  }

  /**
   * Get all reservations
   */
  async findAll(): Promise<Reservation[]> {
    return this.reservationsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get single reservation by ID
   */
  async findOne(id: string): Promise<Reservation | null> {
    return this.reservationsRepository.findOne({ where: { id } });
  }

  /**
   * Cron job - runs every 10 seconds as fallback for missed expiration jobs
   * This ensures even if Bull Queue fails, reservations still expire
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleExpiredReservations() {
    try {
      const expiredReservations = await this.reservationsRepository.find({
        where: {
          status: ReservationStatus.ACTIVE,
          expiresAt: LessThan(new Date()),
        },
      });

      if (expiredReservations.length > 0) {
        console.log(
          `🔍 Cron found ${expiredReservations.length} expired reservations`,
        );

        for (const reservation of expiredReservations) {
          await this.expireReservation(reservation.id);
        }
      }
    } catch (error) {
      console.error('❌ Error in cron job:', error.message);
    }
  }

  /**
   * Expire a reservation and restore stock
   * Safe to call multiple times - idempotent operation
   */
  async expireReservation(reservationId: string): Promise<void> {
    try {
      const reservation = await this.reservationsRepository.findOne({
        where: { id: reservationId },
      });

      // If not found or already processed, skip
      if (!reservation || reservation.status !== ReservationStatus.ACTIVE) {
        return;
      }

      // Mark as expired
      reservation.status = ReservationStatus.EXPIRED;
      await this.reservationsRepository.save(reservation);

      // Restore stock
      await this.productsService.incrementStock(
        reservation.productId,
        reservation.quantity,
      );

      console.log(
        `⏰ Reservation ${reservationId} expired - stock restored (${reservation.quantity} units)`,
      );
    } catch (error) {
      console.error(
        `❌ Error expiring reservation ${reservationId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get reservation statistics
   */
  async getStatistics() {
    const active = await this.reservationsRepository.countBy({
      status: ReservationStatus.ACTIVE,
    });
    const completed = await this.reservationsRepository.countBy({
      status: ReservationStatus.COMPLETED,
    });
    const expired = await this.reservationsRepository.countBy({
      status: ReservationStatus.EXPIRED,
    });

    return { active, completed, expired };
  }
}