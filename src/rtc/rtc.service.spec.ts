import { Test, TestingModule } from '@nestjs/testing';
import { RtcService } from './rtc.service';

describe('RtcService', () => {
  let service: RtcService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RtcService],
    }).compile();

    service = module.get<RtcService>(RtcService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
