import { Test, TestingModule } from '@nestjs/testing';
import { GroupRtcService } from './group-rtc.service';

describe('GroupRtcService', () => {
  let service: GroupRtcService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GroupRtcService],
    }).compile();

    service = module.get<GroupRtcService>(GroupRtcService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
