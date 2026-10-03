import Cloudflare from 'cloudflare';

const client = new Cloudflare({
    apiToken: process.env['CLOUDFLARE_API_TOKEN'],
});

const params = {
    account: {
        id: '023e105f4ecef8ad9ca31a8372d0c353',
    },
    name: 'example.com',
    type: 'full' as const,
};

const zone = await client.zones.create(params);

console.log(zone);