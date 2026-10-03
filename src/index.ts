import express from 'express';
import type { Request, Response } from 'express';
const app = express();
const PORT = 5000;

import Cloudflare from 'cloudflare';



app.get("/", async (req: Request, res: Response) => {
    try {

        const client = new Cloudflare({
            apiToken: process.env['CLOUDFLARE_API_TOKEN'], // This is the default and can be omitted
        });

        const zone = await client.zones.create({
            account: { id: '023e105f4ecef8ad9ca31a8372d0c353' },
            name: 'example.com',
            type: 'full',
        });

        console.log(zone.id);
        res.status(200).json({ "hello": "world" });
        
    } catch (e) {
        res.status(500).json({ "message": e })
    }
})


app.listen(PORT, () => console.log(`server is runnning at : http://localhost:${PORT}`))