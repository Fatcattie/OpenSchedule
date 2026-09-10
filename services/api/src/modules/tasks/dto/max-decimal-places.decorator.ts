/**
 * 小数位上限自定义校验器（§3.5.5：estimated_hours/actual_hours 小数 1 位）。
 */
import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function MaxDecimalPlaces(maxPlaces: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxDecimalPlaces',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'number' || !Number.isFinite(value)) return false;
          const places = (String(value).split('.')[1] ?? '').length;
          return places <= maxPlaces;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} 最多允许 ${maxPlaces} 位小数`;
        },
      },
    });
  };
}
