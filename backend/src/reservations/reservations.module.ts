import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsProcessor } from './reservations.processor';
import { Reservation } from './entities/reservation.entity';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation]),
    BullModule.registerQueue({
      name: 'reservations',
    }),
    ProductsModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService, ReservationsProcessor],
})
export class ReservationsModule {}