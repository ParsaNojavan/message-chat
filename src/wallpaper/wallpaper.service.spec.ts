import { Test, TestingModule } from '@nestjs/testing';
import { WallpaperService } from './wallpaper.service';

describe('WallpaperService', () => {
  let service: WallpaperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WallpaperService],
    }).compile();

    service = module.get<WallpaperService>(WallpaperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
