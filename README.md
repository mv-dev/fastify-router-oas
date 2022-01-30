# fastify-router-oas

A library designed to connect Fastify application endpoints with the OPENAPI 3 scheme, which describes them. It supports validation for content type *application/json* and *multipart/form-data*, which is using as file upload.

## Main components of the library:

1. defining inputs/outputs of application endpoints
2. automatic inputs/outputs validation of application endpoints based on the defined OPENAPI scheme
3. multiple security support for individual endpoints
4. automatic generation of a swagger ui, accessible via a web browser

## Usage

Usage is pretty simple, just register *fastify-router-oas* to application like this:

```javascript
// some code above

fastify.register(fastifyRouterOas, {
  controllersPath: __dirname + '/controllers',
  openapiFilePath: './api.yaml',
  openapiUrlPath: '/swagger',
  security: {}
});

// some code below
```

## Example

Let's create simple Fastify application:

```javascript
// ./app.ts

import fastify from 'fastify';
import fastifyRouterOas from 'fastify-router-oas';


async function createServer() {
  const server = fastify();

  server.register(fastifyRouterOas, {
    controllersPath: __dirname + '/controllers',
    openapiFilePath: './api.yaml',
    openapiUrlPath: '/swagger',
    security: {}
  });

  return server;
}

createServer()
  .then((server) => {
    server.listen(3000, '0.0.0.0', (e, host) => {
      if (e) {
        throw e;
      }
      
      console.log(`Server listening on ${host}`);
    });
  })
  .catch((e) => {
    throw e;
  })
```

We need a controller in *./controllers* directory:

```javascript
// ./controllers/test.ts

export const testAction = async (req) => {
  // some logic

  return {
    status: 'OK'
  };
};

export const uploadFile = async (req) => {
  const file = req['file'];

  // some logic with file, which has following structure:
  // {
  //   fieldname: string,
  //   originalname: string,
  //   encoding: string,
  //   mimetype: string,
  //   buffer: Buffer,
  //   size: number
  // }

  return {
    'status': 'File uploaded!'
  };
};
```

Let's define OPENAPI schema for our two actions in controller above:

```yaml
openapi: 3.0.2
info:
  version: 1.0.0
  title: fastify-router-oas example
servers:
  - url: /api/v1
paths:
  /test-action:
    x-controller: test
    get:
      operationId: testAction
      tags: [Test]
      responses:
        200:
          description: Test action
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
  /upload-file:
    x-controller: test
    post:
      operationId: uploadFile
      tags: [Test]
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                upload:
                  type: string
                  format: binary
      responses:
        200:
          description: File uploaded
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
```

## Usage of security

Usage of security contains to define a function, which provide security and attach it to definition of fastify-router-oas. It's something like following:

```javascript
// some code above

fastify.register(fastifyRouterOas, {
  controllersPath: __dirname + '/controllers',
  openapiFilePath: './api.yaml',
  openapiUrlPath: '/swagger',
  security: {
    simple: simpleSecurity
  }
});

// some code below

async simpleSecurity(req: any): Promise<any> {
  // validation of api key, user access token or whatever...
}
```

To definition of OPENAPI we need to add *security* attribute:

```yaml
...
/test-action:
  x-controller: test
  get:
    operationId: testAction
    tags: [Test]
    security:
      - simple: []
    responses:
      200:
        description: Test action
        ...
```

## Conslusion

That's it! That simple way you can define your API by OPENAPI schema. Swagger UI you can find on defined path, as example above, you can find it at *localhost:3000/swagger*