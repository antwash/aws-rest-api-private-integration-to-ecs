import { Args, Field, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { CarsService } from './cars.service';
import { NotFoundException } from '@nestjs/common';

@ObjectType()
class Car {
  @Field()
  id: number;

  @Field()
  make: string;

  @Field()
  model: string;

  @Field()
  year: number;

  @Field()
  price: string;
}

@Resolver((of) => Car)
export class CarResolver {
  constructor(private readonly carsService: CarsService) {}

  @Query((returns) => Car)
  async car(@Args('id') id: number): Promise<Car> {
    const car = await this.carsService.findById(id);

    if (!car) {
      throw new NotFoundException(id);
    }

    return car;
  }

  @Query((returns) => [Car])
  async cars(): Promise<Car[]> {
    return await this.carsService.findAll();
  }
}
