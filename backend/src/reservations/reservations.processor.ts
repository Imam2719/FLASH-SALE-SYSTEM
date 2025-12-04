import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { ReservationsService } from './reservations.service';

@Processor('reservations')
export class ReservationsProcessor {
  constructor(private reservationsService: ReservationsService) {}

  @Process('expire-reservation')
  async handleExpiration(job: Job) {
    const { reservationId } = job.data;
    console.log(`🔄 Processing expiration job for reservation ${reservationId}`);
    await this.reservationsService.expireReservation(reservationId);
  }
}