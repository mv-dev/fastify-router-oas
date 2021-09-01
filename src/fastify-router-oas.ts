import SwaggerParser from '@apidevtools/swagger-parser';
import multer from 'fastify-multer';


const CONTENT_TYPE_APPLICATION_JSON = 'application/json';
const CONTENT_TYPE_MULTIPART_FORM_DATA = 'multipart/form-data';

export default async function router(
  server, 
  options: {
    controllersPath: string,
    openapiPath: string,
    security: any
  },
  next
) {
  try {
    const multerUpload = multer({
      storage: multer.memoryStorage()
    });

    server.register(multer.contentParser);

    server.register(routerPlugin, {
      controllersPath: options.controllersPath,
      openapiPath: options.openapiPath,
      security: options.security,
      multerUpload: multerUpload
    });

    next();
  } catch (err) {
    throw err;
  }
}

async function routerPlugin(
  server, 
  options: {
    controllersPath: string,
    openapiPath: string,
    security: any,
    multerUpload: any
  },
  next
) {
  const requestMethods: Array<string> = [
    'get',
    'post',
    'put',
    'delete'
  ];

  try {
    const swaggerParser = new SwaggerParser();
    const parsedSwagger = await swaggerParser.validate(options.openapiPath);
    console.log('API name: %s, Version: %s', parsedSwagger.info.title, parsedSwagger.info.version);

    if (!parsedSwagger || !parsedSwagger.paths) {
      next();
    }

    let isMulterUsed: boolean = false;
    let multerUpload = options.multerUpload;

    let importedControllers: Array<any> = [];

    const urlPrefix: string = parsedSwagger['servers'][0].url;
    const paths: Array<string> = Object.keys(parsedSwagger.paths);

    paths.forEach(async (simplePath: string) => {
      const endpointData = parsedSwagger.paths[simplePath];

      if (!importedControllers[endpointData['x-controller']]) {
        importedControllers[endpointData['x-controller']] = await import(options.controllersPath + '/' +  endpointData['x-controller']);
      }

      let path = urlPrefix + simplePath;

      requestMethods.forEach((requestMethod: string) => {
        const endpointDataRequestMethod = endpointData[requestMethod];

        if (endpointDataRequestMethod) {
          const operationId = endpointDataRequestMethod['operationId'];

          if (operationId) {
            const operation = importedControllers[endpointData['x-controller']][operationId];
            const schema = createFastifySchema(endpointDataRequestMethod);
            const security = endpointDataRequestMethod.security;

            let securityForRequest = null;
            if (security && security.length) {
              const securityTypes = Object.keys(security[0]);
              if (securityTypes.length && options.security[securityTypes[0]]) {
                securityForRequest = securityTypes[0];
              }
            }

            if (schema.params) {
              path = replaceParams(path);
            }
          
            let multipartFormDataProperty: string = '';
            if (schema[CONTENT_TYPE_MULTIPART_FORM_DATA]) {
              if (schema[CONTENT_TYPE_MULTIPART_FORM_DATA]['properties']) {
                let keys = Object.keys(schema[CONTENT_TYPE_MULTIPART_FORM_DATA]['properties']);

                if (keys) {
                  multipartFormDataProperty = keys[0];

                  if (schema[CONTENT_TYPE_MULTIPART_FORM_DATA]['properties'][multipartFormDataProperty]['type']) {
                    // TODO
                  } else {
                    console.log('THROW EXCEPTION - should have uploaded file type (string)')  
                  }

                  if (schema[CONTENT_TYPE_MULTIPART_FORM_DATA]['properties'][multipartFormDataProperty]['format']) {
                    // TODO
                  } else {
                    console.log('THROW EXCEPTION - should have uploaded file format (binary / base64)')  
                  }
                } else {
                  console.log('THROW EXCEPTION - should have 1 property (upload)')
                }
              }

              delete schema[CONTENT_TYPE_MULTIPART_FORM_DATA];
            }

            let route: any = {
              method: requestMethod.toUpperCase(),
              url: path,
              schema: schema,
              preValidation: async (req, res) => {
                // security
                if (securityForRequest) {
                  req.auth = await options.security[securityForRequest](req);
                }
              },
              handler: async (req, res) => {
                res.code(200).send(await operation(req));
              }
            };

            if (multipartFormDataProperty) {
              route['preHandler'] = multerUpload.single(multipartFormDataProperty);
            }

            server.route(route);
          }  
        }
      });
    });

    next();
  } catch(err) {
    throw err;
  }
}

interface IFastifySchema {
  body?: any,
  querystring?: any,
  params?: any,
  response?: any
}

function createFastifySchema(requestMethod: any): IFastifySchema {
  let fastifySchema: IFastifySchema = {};

  if (requestMethod.parameters && Array.isArray(requestMethod.parameters)) {
    requestMethod.parameters.forEach((parameter) => {
      if (parameter.name && parameter.in && parameter.schema) {
        if (parameter.in === 'query') {
          if (!fastifySchema.querystring) {
            fastifySchema.querystring = {};
          }

          fastifySchema.querystring[parameter.name] = parameter.schema;
        } else if (parameter.in === 'path') {
          if (!fastifySchema.params) {
            fastifySchema.params = {};
          }

          if (!fastifySchema.params['type'] || !fastifySchema.params['properties']) {
            fastifySchema.params['type'] = 'object';
            fastifySchema.params['properties'] = {};
          }

          fastifySchema.params['properties'][parameter.name] = parameter.schema;
        }
      }
    });
  }

  if (requestMethod.requestBody) {
    if (requestMethod.requestBody.content) {
      const contentTypes = Object.keys(requestMethod.requestBody.content);
      contentTypes.forEach((contentType: string) => {
        if (requestMethod.requestBody.content[contentType] && requestMethod.requestBody.content[contentType].schema) {
          if (contentType === CONTENT_TYPE_APPLICATION_JSON) {
            fastifySchema.body = requestMethod.requestBody.content[contentType].schema;
          } else if (contentType === CONTENT_TYPE_MULTIPART_FORM_DATA) {
            fastifySchema[CONTENT_TYPE_MULTIPART_FORM_DATA] = requestMethod.requestBody.content[contentType].schema;
          }
        }
      });
    }
  }

  if (requestMethod.responses) {
    Object.keys(requestMethod.responses).forEach((responseCode) => {
      let response = requestMethod.responses[responseCode];

      if (!fastifySchema.response) {
        fastifySchema.response = {};
      }

      if (response.content) {
        if (response.content['application/json']) {
          if (response.content['application/json'].schema) {
            fastifySchema.response[responseCode] = response.content['application/json'].schema;
          }
        }
      }
    });
  }

  return fastifySchema;
}

function replaceParams(path: string): string {
  const pattern = /{(\w+)}/g
  const matches = path.matchAll(pattern);
  
  for (const match of matches) {
    let replaceFrom = match[0];
    let replaceTo = `:${match[1]}`;

    path = path.replace(replaceFrom, replaceTo);
  }

  return path;
}
