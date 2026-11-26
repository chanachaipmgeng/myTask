import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { VisibilityScopeService } from './visibility-scope.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, VisibilityScopeService],
  exports: [AuthService, AuthGuard, VisibilityScopeService],
})
export class AuthModule {}
