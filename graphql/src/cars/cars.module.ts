import { Module } from '@nestjs/common';
import { CarResolver } from './cars.resolver';
import { CarsService } from './cars.service';

@Module({
  providers: [CarResolver, CarsService],
})
export class CarsModule {}
