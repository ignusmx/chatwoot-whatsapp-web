import fs from "fs";
import dotenv from "dotenv";
import express, { Express } from "express";
import { Server } from "http";
import axios from "axios";
import qrcode from "qrcode";
import humps from "humps";
import {
    Client,
    Contact,
    GroupChat,
    GroupNotification,
    GroupParticipant,
    LocalAuth,
    MessageContent,
    MessageMedia,
} from "whatsapp-web.js";
import { ChatwootAPI } from "./ChatwootAPI";
import { ChatwootMessage } from "./types";
import { Readable } from "stream";
import FormData from "form-data";
import React, { useState, useEffect } from "react";
import { Box, Newline, render, Spacer, Text } from "ink";

if (
    !process.env.CHATWOOT_API_URL ||
    !process.env.CHATWOOT_API_KEY ||
    !process.env.CHATWOOT_ACCOUNT_ID ||
    !process.env.CHATWOOT_WW_INBOX_ID ||
    !process.env.CHATWOOT_WW_GROUP_PARTICIPANTS_ATTRIBUTE_NAME
) {
    // assert that required envs are set or try to fallback to file
    try {
        fs.accessSync(".env", fs.constants.F_OK);
        dotenv.config();
    } catch {
        console.error("ENV vars aren't set.");
        process.exit(16);
    }
}

interface AppProps {
    express: Express;
    server: Server;
}

const App = (props: AppProps) => {
    const { express, server } = props;
    const [whatsappStatus, setWhatsappStatus] = useState("Initializing WhatsApp Web...");
    const [appStatus, setAppStatus] = useState("Press ctrl+c to stop.");
    const [qr, setQr] = useState("");

    const puppeteer = process.env.DOCKERIZED
        ? {
              headless: true,
              args: ["--no-sandbox"],
              executablePath: "google-chrome-stable",
          }
        : {};

    useEffect(() => {
        qrcode.toString("asdfasda234sdfsdfs123456g", { type: "terminal", small: true }, (err, buffer) => {
            if (!err) {
                setQr(buffer);
                //console.log(buffer);
            } else {
                console.error(err);
            }
        });

        const whatsappWebClient = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                handleSIGINT: false,
                ...puppeteer,
            },
        });

        const chatwootAPI: ChatwootAPI = new ChatwootAPI(
            process.env.CHATWOOT_API_URL ?? "",
            process.env.CHATWOOT_API_KEY ?? "",
            process.env.CHATWOOT_ACCOUNT_ID ?? "",
            process.env.CHATWOOT_WW_INBOX_ID ?? "",
            process.env.CHATWOOT_WW_GROUP_PARTICIPANTS_ATTRIBUTE_NAME ?? "",
            whatsappWebClient
        );

        whatsappWebClient.on("qr", (qr) => {
            setWhatsappStatus("WhatsApp needs to connect, use the following to QR to authorize it.");

            qrcode.toString(qr, { type: "terminal", small: true }, (err, buffer) => {
                if (!err) {
                    setQr(buffer);
                    //console.log(buffer);
                } else {
                    console.error(err);
                }
            });

            if (process.env.SLACK_TOKEN) {
                qrcode.toBuffer(qr, { scale: 6 }, (err, buffer) => {
                    console.log(buffer);

                    const form = new FormData();

                    form.append("token", process.env.SLACK_TOKEN ?? "");
                    form.append("channels", process.env.SLACK_CHANNEL_ID ?? "");
                    form.append("title", "QR Code");
                    form.append("initial_comment", "WahtsApp needs to connect, use this code to authorize your number:");
                    form.append(
                        "file",
                        new Readable({
                            read() {
                                this.push(buffer);
                                this.push(null);
                            },
                        }),
                        "qr.png"
                    );

                    if (!err) {
                        axios
                            .postForm("https://slack.com/api/files.upload", form, {
                                headers: form.getHeaders(),
                            })
                            .then((response) => {
                                console.log(response.data);
                            })
                            .catch((err) => {
                                console.error(err);
                            });
                    } else {
                        console.error(err);
                    }
                });
            }
        });

        whatsappWebClient.on("ready", () => {
            setWhatsappStatus("WhatsApp client is ready!");
            setQr("");
        });

        whatsappWebClient.on("message", async (message) => {
            let attachment = null;
            if (message.hasMedia) {
                attachment = await message.downloadMedia();
            }

            let messagePrefix: string | undefined;
            let authorContact: Contact;
            //if author != null it means the message was sent to a group chat
            //so we need to prefix the author's name
            if (message.author != null) {
                authorContact = await whatsappWebClient.getContactById(message.author);
                messagePrefix = `${authorContact.name ?? authorContact.pushname ?? authorContact.number}: `;
            }

            chatwootAPI.broadcastMessageToChatwoot(message, "incoming", attachment, messagePrefix);
        });

        whatsappWebClient.on("message_create", async (message) => {
            if (message.fromMe) {
                let attachment: MessageMedia | undefined;
                const rawData: any = message.rawData;
                //broadcast WA message to chatwoot only if it was created
                //from a real device/wa web and not from chatwoot app
                //to avoid endless loop
                if (rawData.self == "in") {
                    if (message.hasMedia) {
                        attachment = await message.downloadMedia();
                    }

                    chatwootAPI.broadcastMessageToChatwoot(
                        message,
                        "outgoing",
                        attachment,
                        process.env.REMOTE_PRIVATE_MESSAGE_PREFIX
                    );
                }
            }
        });

        whatsappWebClient.on("group_join", async (groupNotification: GroupNotification) => {
            const groupChat: GroupChat = (await groupNotification.getChat()) as GroupChat;
            chatwootAPI.updateChatwootConversationGroupParticipants(groupChat);
        });

        whatsappWebClient.on("group_leave", async (groupNotification: GroupNotification) => {
            const groupChat: GroupChat = (await groupNotification.getChat()) as GroupChat;
            chatwootAPI.updateChatwootConversationGroupParticipants(groupChat);
        });

        whatsappWebClient.initialize().catch((err) => {
            setWhatsappStatus("Error: Unable to initialize WhatsApp.");
        });

        express.get("/", async (req, res) => {
            res.status(200).json({
                status: "OK",
                req: req.ip,
            });
        });

        express.post("/chatwootMessage", async (req, res) => {
            try {
                //const chatwootMessage: ChatwootMessage = humps.camelizeKeys(req.body);
                const { token } = req.query;
                const chatwootMessage = req.body;

                //quick authentication with chatwoot api key
                if (process.env.CHATWOOT_WEBHOOK_TOKEN && token != process.env.CHATWOOT_WEBHOOK_TOKEN) {
                    res.status(401).json({
                        result: "Unauthorized access. Please provide a valid token.",
                    });

                    return;
                }

                const whatsappWebClientState = await whatsappWebClient.getState();
                //post to whatsapp only if we are connected to the client and message is not private
                if (
                    whatsappWebClientState === "CONNECTED" &&
                    chatwootMessage.inbox.id == process.env.CHATWOOT_WW_INBOX_ID &&
                    chatwootMessage.message_type == "outgoing" &&
                    !chatwootMessage.private
                ) {
                    const chatwootContact = await chatwootAPI.getChatwootContactById(
                        chatwootMessage.conversation.contact_inbox.contact_id
                    );
                    const messages = await chatwootAPI.getChatwootConversationMessages(chatwootMessage.conversation.id);
                    const messageData = messages.find((message: any) => {
                        return message.id === chatwootMessage.id;
                    });

                    const to = `${chatwootContact.identifier}`;
                    let formattedMessage: string | undefined = chatwootMessage.content;
                    let messageContent: MessageContent | undefined;

                    const chatwootMentions: RegExpMatchArray | null =
                        formattedMessage == null ? null : formattedMessage.match(/@("[^@"']+"|'[^@"']+'|[^@\s"']+)/g);
                    const options: any = {};

                    if (formattedMessage != null && chatwootMentions != null) {
                        const whatsappMentions: Array<Contact> = [];
                        const groupChat: GroupChat = (await whatsappWebClient.getChatById(to)) as GroupChat;
                        const groupParticipants: Array<GroupParticipant> = groupChat.participants;
                        for (const mention of chatwootMentions) {
                            for (const participant of groupParticipants) {
                                const mentionIdentifier = mention
                                    .substring(1)
                                    .replaceAll("+", "")
                                    .replaceAll('"', "")
                                    .replaceAll("'", "")
                                    .toLowerCase();
                                const participantIdentifier = `${participant.id.user}@${participant.id.server}`;
                                const contact: Contact = await whatsappWebClient.getContactById(participantIdentifier);
                                if (
                                    (contact.name != null && contact.name.toLowerCase().includes(mentionIdentifier)) ||
                                    (contact.pushname != null && contact.pushname.toLowerCase().includes(mentionIdentifier)) ||
                                    contact.number.includes(mentionIdentifier)
                                ) {
                                    whatsappMentions.push(contact);
                                    formattedMessage = formattedMessage.replace(mention, `@${participant.id.user}`);
                                    break; //we continue with next mention since we found our contact and there's no need to keep searching
                                }
                            }
                        }
                        options.mentions = whatsappMentions;
                    }

                    if (process.env.PREFIX_AGENT_NAME_ON_MESSAGES == "true") {
                        let senderName = chatwootMessage.sender?.name;
                        if (chatwootMessage.conversation.messages != null && chatwootMessage.conversation.messages.length > 0) {
                            const sender = chatwootMessage.conversation.messages[0].sender;
                            senderName = sender.available_name ?? sender.name;
                        }

                        formattedMessage = `${senderName}: ${formattedMessage ?? ""}`;
                    }

                    if (messageData.attachments != null && messageData.attachments.length > 0) {
                        const media = await MessageMedia.fromUrl(messageData.attachments[0].data_url);
                        if (formattedMessage != null) {
                            options.caption = formattedMessage;
                        }

                        messageContent = media;
                    } else {
                        messageContent = formattedMessage;
                    }

                    if (messageContent != null) {
                        whatsappWebClient.sendMessage(to, messageContent, options);
                    }
                }

                res.status(200).json({ result: "message_sent_succesfully" });
            } catch {
                res.status(400).json({ result: "exception_error" });
            }
        });

        // add gracefull closing
        process.on("SIGINT", async () => {
            setAppStatus("SIGINT signal received: closing HTTP server...");

            server.close(() => {
                whatsappWebClient.destroy().finally(() => {
                    setAppStatus("Server closed.");
                    process.exitCode = 0;
                    process.exit(0);
                });
            });
        });
    }, []);

    return (
        <>
            <Box borderStyle="round" flexDirection="column" padding={1}>
                <>
                    <Box flexDirection="column">
                        <Text bold>Express</Text>

                        <Box padding={1}>
                            <Text color="green">Server listening on {process.env.PORT ?? ""}.</Text>
                        </Box>
                    </Box>
                    <Box flexDirection="column">
                        <Text bold>WhatsApp Driver</Text>
                        <Box padding={1} flexDirection="column">
                            <Text color="white">{whatsappStatus}</Text>
                            <Newline />
                            {qr !== "" && (
                                <Box>
                                    <Text>{qr}</Text>
                                </Box>
                            )}
                        </Box>
                    </Box>
                </>
            </Box>
            <Text dimColor color="green">
                {appStatus}
            </Text>
        </>
    );
};

const expressApp = express();

expressApp.use(
    express.json(),
    express.urlencoded({
        extended: true,
    })
);

//init api server
const server = expressApp.listen(process.env.PORT ?? "", () => {
    render(<App express={expressApp} server={server} />);
});
