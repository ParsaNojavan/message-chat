import { Test, TestingModule } from '@nestjs/testing';
import { WallpaperController } from './wallpaper.controller';

describe('WallpaperController', () => {
  let controller: WallpaperController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WallpaperController],
    }).compile();

    controller = module.get<WallpaperController>(WallpaperController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
