import { Reflector } from '@nestjs/core';
import { AppRole } from '../interfaces/app-role.interface';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('Roles decorator', () => {
  it('sets the allowed roles on the decorated handler', () => {
    class TestController {
      @Roles(AppRole.admin, AppRole.support)
      handler() {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<AppRole[]>(
      ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      TestController.prototype.handler,
    );

    expect(roles).toEqual([AppRole.admin, AppRole.support]);
  });

  it('leaves undecorated handlers without role metadata', () => {
    class TestController {
      handler() {}
    }

    const reflector = new Reflector();
    const roles = reflector.get<AppRole[]>(
      ROLES_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      TestController.prototype.handler,
    );

    expect(roles).toBeUndefined();
  });
});
