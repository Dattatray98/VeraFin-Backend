import Cloudflare from 'cloudflare';

const client = new Cloudflare({
    apiToken: process.env['CLOUDFLARE_API_TOKEN'], // This is the default and can be omitted
});

const params: Cloudflare.ZoneCreateParams = {
    account: { id: '023e105f4ecef8ad9ca31a8372d0c353' },
    name: 'example.com',
    type: 'full',
};
const zone: Cloudflare.Zone = await client.zones.create(params);