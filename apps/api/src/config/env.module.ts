import { loadEnv } from "@health-trainer/config";
import { Global, Module } from "@nestjs/common";

export const APP_ENV = Symbol("APP_ENV");

@Global()
@Module({
  providers: [
    {
      provide: APP_ENV,
      useFactory: () => loadEnv(),
    },
  ],
  exports: [APP_ENV],
})
export class EnvModule {}
