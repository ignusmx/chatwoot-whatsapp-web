import { Client, Contact, GroupChat, GroupNotification, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode";
import Slack from "../integrations/slack";
import { ChatwootAPI } from "./chatwootAPI";

export default class WhatsApp {
    private clientRef: Client;

    public get client(): Client {
        return this.clientRef;
    }

    private chatwootRef: ChatwootAPI | undefined;
    public set chatwoot(v: ChatwootAPI) {
        this.chatwootRef = v;
    }

    private setWhatsappStatusRef: React.Dispatch<React.SetStateAction<string>>;
    private setQRRef: React.Dispatch<React.SetStateAction<string>>;

    constructor(
        setWhatsappStatus: React.Dispatch<React.SetStateAction<string>>,
        setQR: React.Dispatch<React.SetStateAction<string>>
    ) {
        this.setWhatsappStatusRef = setWhatsappStatus;
        this.setQRRef = setQR;

        const puppeteer = process.env.DOCKERIZED
            ? {
                headless: true,
                args: ["--no-sandbox"],
                executablePath: "google-chrome-stable",
            }
            : {};

        this.clientRef = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                // handleSIGINT: false,
                ...puppeteer,
            },
        });

        this.clientRef.on("qr", (qr) => {
            this.setWhatsappStatusRef("WhatsApp needs to connect, use the following to QR to authorize it.");

            qrcode.toString(qr, { type: "terminal", small: true }, (err, buffer) => {
                if (!err) {
                    this.setQRRef(buffer);
                    //console.log(buffer);
                } else {
                    console.error(err);
                }
            });

            if (process.env.SLACK_TOKEN) {
                qrcode.toBuffer(qr, { scale: 6 }, (err, buffer) => {
                    if (!err) {
                        Slack.broadcastQR(buffer);
                    } else {
                        console.error(err);
                    }
                });
            }
        });

        this.clientRef.on("ready", () => {
            this.setWhatsappStatusRef("WhatsApp client is ready!");
            this.setQRRef("");
        });

        this.clientRef.on("message", async (message) => {
            let attachment = null;
            if (message.hasMedia) {
                attachment = await message.downloadMedia();
            }

            let messagePrefix: string | undefined;
            let authorContact: Contact;
            //if author != null it means the message was sent to a group chat
            //so we need to prefix the author's name
            if (message.author != null) {
                authorContact = await this.clientRef.getContactById(message.author);
                messagePrefix = `${authorContact.name ?? authorContact.pushname ?? authorContact.number}: `;
            }

            this.chatwootRef?.broadcastMessageToChatwoot(message, "incoming", attachment, messagePrefix);
        });

        this.clientRef.on("message_create", async (message) => {
            if (message.fromMe) {
                let attachment: MessageMedia | undefined;

                const rawData = <{ self: string }>message.rawData;
                //broadcast WA message to chatwoot only if it was created
                //from a real device/wa web and not from chatwoot app
                //to avoid endless loop
                if (rawData.self === "in") {
                    if (message.hasMedia) {
                        attachment = await message.downloadMedia();
                    }

                    this.chatwootRef?.broadcastMessageToChatwoot(
                        message,
                        "outgoing",
                        attachment,
                        process.env.REMOTE_PRIVATE_MESSAGE_PREFIX
                    );
                }
            }
        });

        this.clientRef.on("group_join", async (groupNotification: GroupNotification) => {
            const groupChat: GroupChat = (await groupNotification.getChat()) as GroupChat;
            this.chatwootRef?.updateChatwootConversationGroupParticipants(groupChat);
        });

        this.clientRef.on("group_leave", async (groupNotification: GroupNotification) => {
            const groupChat: GroupChat = (await groupNotification.getChat()) as GroupChat;
            this.chatwootRef?.updateChatwootConversationGroupParticipants(groupChat);
        });

        this.clientRef.initialize().catch(() => {
            this.setWhatsappStatusRef("Error: Unable to initialize WhatsApp.");
        });
    }
}
