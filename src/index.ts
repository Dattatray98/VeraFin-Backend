import express from 'express';
import type { Request, Response } from 'express';
const app = express();
const PORT = 5000;




app.get("/", (req: Request, res: Response) => {
    try {
        res.status(200).json({ "hello": "world" });
    } catch (e) {
        res.status(500).json({ "message": e })
    }
})


app.listen(PORT, () => console.log(`server is runnning at : http://localhost:${PORT}`))