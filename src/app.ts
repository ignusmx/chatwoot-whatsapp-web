import express from "express";
import qrcode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { ChatwootAPI } from "./ChatwootAPI";
import dotenv from "dotenv";
import fs from "fs";
import { ChatwootMessage } from "./types";
import humps from "humps";

if (
    !process.env.CHATWOOT_API_URL ||
    !process.env.CHATWOOT_API_KEY ||
    !process.env.CHATWOOT_ACCOUNT_ID ||
    !process.env.WHATSAPP_WEB_CHATWOOT_INBOX_ID
) {
    // assert that required envs are set or try to fallback to file
    try {
        fs.accessSync(".env", fs.constants.F_OK);
        dotenv.config();
    } catch {
        console.error("ENV vars aren't set.");
        process.exit(1);
    }
}

const expressApp = express();

const whatsappWebClient = new Client({
    authStrategy: new LocalAuth(),
});

const chatwootAPI: ChatwootAPI = new ChatwootAPI(
    process.env.CHATWOOT_API_URL ?? "",
    process.env.CHATWOOT_API_KEY ?? "",
    process.env.CHATWOOT_ACCOUNT_ID ?? "",
    process.env.WHATSAPP_WEB_CHATWOOT_INBOX_ID ?? ""
);

expressApp.use(
    express.urlencoded({
        extended: true,
    })
);
expressApp.use(express.json());

whatsappWebClient.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
});

whatsappWebClient.on("ready", () => {
    console.log("Client is ready!");
});

whatsappWebClient.on("message", (message) => {
    chatwootAPI.broadcastMessageToChatwoot(message);
});

whatsappWebClient.initialize();

expressApp.get("/", async (req, res) => {
    res.status(200).json({
        status: "OK",
        req: req.ip,
    });
});

expressApp.post("/chatwootMessage", async (req, res) => {
    try {
        const chatwootMessage: ChatwootMessage = humps.camelizeKeys(req.body);
        const whatsappWebClientState = await whatsappWebClient.getState();

        if (whatsappWebClientState === "CONNECTED") {
            const to = `${chatwootMessage.meta?.sender?.phoneNumber?.substring(1)}@c.us`;

            chatwootMessage.messages?.every((message) => {
                whatsappWebClient.sendMessage(to, `${message.content}`);
            });
        }

        res.status(200).json({ result: "message_sent_succesfully" });
    } catch {
        res.status(400);
    }
});

//init api server
const server = expressApp.listen(process.env.PORT ?? "", () => {
    console.log(`API listening on ${process.env.PORT ?? ""}...`);
});

// add gracefull closing
process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    server.close(() => {
        console.log("HTTP server closed");
    });
});

module.exports = expressApp;
