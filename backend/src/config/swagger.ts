import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Secure Cloud File Storage API',
      version: '1.0.0',
      description:
        'REST API for a secure cloud file storage system using hybrid cryptography (AES-256-GCM + RSA-OAEP). ' +
        'See /openapi.yaml in the project root for the full specification with request/response examples.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [], // Full endpoint documentation lives in openapi.yaml (richer to hand-maintain for this project)
});
