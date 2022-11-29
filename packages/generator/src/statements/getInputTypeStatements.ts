/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { CodeBlockWriter } from 'ts-morph';

import { ExtendedDMMFSchemaArgInputType } from '../classes';
import { GetStatements, Statement } from '../types';
import { writeConstStatement, writeHeading } from '../utils';

/////////////////////////////////////////////////
// TYPES & INTERFACES
/////////////////////////////////////////////////

interface WriteTypeOptions {
  inputType: ExtendedDMMFSchemaArgInputType;
  isOptional?: boolean;
  isNullable?: boolean;
  writeLazy?: boolean;
}

interface WriteScalarTypeOptions extends WriteTypeOptions {
  zodValidatorString?: string;
  zodCustomErrors?: string;
}

/////////////////////////////////////////////////
// HELPER
/////////////////////////////////////////////////

const writeScalarType = (
  writer: CodeBlockWriter,
  {
    inputType,
    isOptional,
    isNullable,
    zodCustomErrors,
    zodValidatorString,
  }: WriteScalarTypeOptions,
) => {
  const zodType = inputType.getZodScalarType();
  if (!zodType) return;

  writer
    .write(`z.${zodType}(`)
    .conditionalWrite(!!zodCustomErrors, zodCustomErrors!)
    .write(`)`)
    .conditionalWrite(!!zodValidatorString, zodValidatorString!)
    .conditionalWrite(inputType.isList, `.array()`)
    .conditionalWrite(isOptional, `.optional()`)
    .conditionalWrite(isNullable, `.nullable()`)
    .write(`,`);
};

const writeNonScalarType = (
  writer: CodeBlockWriter,
  { inputType, isOptional, isNullable, writeLazy = true }: WriteTypeOptions,
) => {
  const nonScalarType = inputType.getZodNonScalarType();
  if (!nonScalarType) return;

  writer
    .conditionalWrite(writeLazy, `z.lazy(() => ${nonScalarType})`)
    .conditionalWrite(!writeLazy, `${nonScalarType}`)
    .conditionalWrite(inputType.isList, `.array()`)
    .conditionalWrite(isOptional, `.optional()`)
    .conditionalWrite(isNullable, `.nullable()`)
    .write(`,`);
};

const writeNullType = (
  writer: CodeBlockWriter,
  { inputType, isOptional: isRequired, isNullable }: WriteTypeOptions,
) => {
  const nullType = inputType.getZodNullType();
  if (!nullType) return;

  writer
    .write(`z.${nullType}(),`)
    .conditionalWrite(!isRequired, `.optional()`)
    .conditionalWrite(isNullable, `.nullable()`)
    .write(`,`);
};

/////////////////////////////////////////////////
// FUNCTION
/////////////////////////////////////////////////

export const getInputTypeStatements: GetStatements = (DMMF) => {
  const { schema, datamodel } = DMMF;

  // GENERATE ENUM
  // ---------------------------------------------------------------------
  const enumStatements: Statement[] = [writeHeading(`ENUMS`, 'FAT')];

  schema.enumTypes.prisma.forEach((enumType) => {
    const enumName = enumType.name;

    enumStatements.push(
      writeConstStatement({
        leadingTrivia: (writer) => writer.newLine(),
        declarations: [
          {
            name: `${enumName}`,
            initializer(writer) {
              writer.write(`z.nativeEnum(Prisma.Prisma.${enumName})`);
            },
          },
        ],
      }),
    );
  });

  datamodel.enums.forEach(({ formattedNames }) => {
    enumStatements.push(
      writeConstStatement({
        leadingTrivia: (writer) => writer.newLine(),
        declarations: [
          {
            name: `${formattedNames.pascalCase}`,
            initializer(writer) {
              writer.write(`z.nativeEnum(Prisma.${formattedNames.pascalCase})`);
            },
          },
        ],
      }),
    );
  });

  // GENERATE TYPES
  // ---------------------------------------------------------------------

  const typesStatements: Statement[] = [writeHeading(`INPUT TYPES`, 'FAT')];

  schema.inputObjectTypes.prisma.forEach((inputType) => {
    typesStatements.push(
      writeConstStatement({
        leadingTrivia: (writer) => writer.newLine(),
        declarations: [
          {
            name: `${inputType.name}`,
            type: `z.ZodType<Prisma.Prisma.${inputType.name}>`,
            initializer: (writer) => {
              writer.write(`z.object(`);
              writer.inlineBlock(() => {
                inputType.fields.forEach((field) => {
                  writer.write(`${field.name}: `);

                  const inputTypes = field.inputTypes.filter(
                    (type) => type.type !== 'Null',
                  );

                  const { isNullable, isOptional } = field;

                  if (inputTypes.length > 1) {
                    writer.write(`z.union([ `);

                    inputTypes.forEach((inputType) => {
                      // don't pass optional and nullable props in this loop
                      // because they are handled by the union
                      writeScalarType(writer, {
                        inputType,
                        zodCustomErrors: field.zodCustomErrors,
                        zodValidatorString: field.zodValidatorString,
                      });

                      writeNonScalarType(writer, {
                        inputType,
                      });
                      writeNullType(writer, {
                        inputType,
                      });
                    });

                    writer
                      .write(` ])`)
                      .conditionalWrite(!field.isRequired, `.optional()`)
                      .conditionalWrite(field.isNullable, `.nullable()`)
                      .write(`,`);
                  } else {
                    const inputType = field.inputTypes[0];
                    writeScalarType(writer, {
                      inputType,
                      zodCustomErrors: field.zodCustomErrors,
                      zodValidatorString: field.zodValidatorString,
                      isNullable,
                      isOptional,
                    });
                    writeNonScalarType(writer, {
                      inputType,
                      isNullable,
                      isOptional,
                    });
                    writeNullType(writer, {
                      inputType,
                      isNullable,
                      isOptional,
                    });
                  }

                  writer.newLine();
                });
              });
              writer.write(`)`).write(`.strict()`);
            },
          },
        ],
      }),
    );
  });

  const argsStatements: Statement[] = [writeHeading(`ARGS`, 'FAT')];

  schema.outputObjectTypes.prisma
    .filter((type) => type.name === 'Query' || type.name === 'Mutation')
    .forEach((outputType) => {
      outputType.fields.forEach((field) => {
        argsStatements.push(
          writeConstStatement({
            leadingTrivia: (writer) => writer.newLine(),
            declarations: [
              {
                name: `${field.argName}`,
                type: `z.ZodType<Prisma.Prisma.${field.argName}>`,
                initializer: (writer) => {
                  writer.write(`z.object(`);
                  writer.inlineBlock(() => {
                    field.args.forEach((arg) => {
                      writer.write(`${arg.name}: `);

                      const inputTypes = arg.inputTypes.filter(
                        (type) => type.type !== 'Null',
                      );

                      const { isOptional, isNullable } = arg;

                      console.log(JSON.stringify(arg, null, 2));

                      if (inputTypes.length > 1) {
                        writer.write(`z.union([ `);

                        inputTypes.forEach((inputType) => {
                          // don't pass optional and nullable props in this loop
                          // because they are handled by the union
                          writeScalarType(writer, {
                            inputType,
                            // isOptional,
                            // isNullable,
                            writeLazy: false,
                          });

                          writeNonScalarType(writer, {
                            inputType,
                            writeLazy: false,
                            // isOptional,
                            // isNullable,
                          });
                          writeNullType(writer, {
                            inputType,
                            // isNullable,
                            // isOptional,
                            writeLazy: false,
                          });
                        });

                        writer
                          .write(` ])`)
                          .conditionalWrite(arg.isOptional, `.optional()`)
                          .conditionalWrite(arg.isNullable, `.nullable()`)
                          .write(`,`);
                      } else {
                        const inputType = arg.inputTypes[0];
                        writeScalarType(writer, {
                          inputType,
                          isNullable,
                          isOptional,
                          writeLazy: false,
                        });
                        writeNonScalarType(writer, {
                          inputType,
                          isNullable,
                          isOptional,
                          writeLazy: false,
                        });
                        writeNullType(writer, {
                          inputType,
                          isNullable,
                          isOptional,
                          writeLazy: false,
                        });
                      }

                      writer.newLine();
                    });
                  });
                  writer.write(`)`).write(`.strict()`);
                },
              },
            ],
          }),
        );
      });
    });

  return [...enumStatements, ...typesStatements, ...argsStatements];
};
