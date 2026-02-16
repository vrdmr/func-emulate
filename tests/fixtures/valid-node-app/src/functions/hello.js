const { app } = require('@azure/functions');

app.http('hello', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const name = request.query.get('name') || 'world';
        return { body: `Hello, ${name}!` };
    }
});
