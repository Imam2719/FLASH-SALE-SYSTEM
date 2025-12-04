import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async onModuleInit() {
    await this.seedProducts();
  }

  async seedProducts() {
    const count = await this.productsRepository.count();
    if (count === 0) {
      const products = [
        {
          name: 'iPhone 15 Pro Max',
          price: 1199,
          availableStock: 10,
          totalStock: 10,
        },
        {
          name: 'Samsung Galaxy S24 Ultra',
          price: 1099,
          availableStock: 15,
          totalStock: 15,
        },
        {
          name: 'MacBook Air M3',
          price: 1299,
          availableStock: 8,
          totalStock: 8,
        },
        {
          name: 'Sony WH-1000XM5 Headphones',
          price: 399,
          availableStock: 20,
          totalStock: 20,
        },
        {
          name: 'iPad Pro 12.9"',
          price: 1099,
          availableStock: 12,
          totalStock: 12,
        },
        {
          name: 'AirPods Pro (2nd Gen)',
          price: 249,
          availableStock: 25,
          totalStock: 25,
        },
      ];
      await this.productsRepository.save(products);
      console.log('✅ Sample products seeded successfully');
    }
  }

  async findAll(): Promise<Product[]> {
    return this.productsRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Product | null> {
    return this.productsRepository.findOne({ where: { id } });
  }

  async decrementStock(id: string, quantity: number): Promise<void> {
    await this.productsRepository.decrement({ id }, 'availableStock', quantity);
  }

  async incrementStock(id: string, quantity: number): Promise<void> {
    await this.productsRepository.increment({ id }, 'availableStock', quantity);
  }
}