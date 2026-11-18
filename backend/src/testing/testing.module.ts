import { Module } from '@nestjs/common';
import { TestingController } from './testing.controller.js';
import { TestingService } from './testing.service.js';

@Module({
  controllers: [TestingController],
  providers: [TestingService],
})
export class TestingModule {}
