import { Injectable } from '@nestjs/common';
import { Car, cars } from './dto';

@Injectable()
export class CarsService {
  async findAll(): Promise<Car[]> {
    return cars;
  }

  async findById(id: number): Promise<Car | null> {
    const car = cars.find((car) => car.id === id);
    return car ? car : null;
  }
}
