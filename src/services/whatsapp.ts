import { Client, Contact, GroupChat, GroupNotification, LocalAuth, MessageMedia } from "whatsapp-web.js";
import qrcode from "qrcode";
import Slack from "../integrations/slack";
import { ChatwootAPI } from "./chatwootAPI";

export default class WhatsApp {
    private clientRef: Client;
    private _clientId: string;

    public get client(): Client {
        return this.clientRef;
    }

    public get clientId(): string {
        return this._clientId;
    }

    private chatwootRef: ChatwootAPI | undefined;
    public set chatwoot(v: ChatwootAPI | undefined) {
        this.chatwootRef = v;
    }

    public get chatwoot(): ChatwootAPI | undefined {
        return this.chatwootRef;
    }

    private setWhatsappStatusRef: React.Dispatch<React.SetStateAction<string>>;
    private setQRRef: React.Dispatch<React.SetStateAction<string>>;

    constructor(
        clientId: string,
        setWhatsappStatus: React.Dispatch<React.SetStateAction<string>>,
        setQR: React.Dispatch<React.SetStateAction<string>>,
    ) {
        this._clientId = clientId;
        this.setWhatsappStatusRef = setWhatsappStatus;
        this.setQRRef = setQR;

        const puppeteer = process.env.DOCKERIZED
            ? {
                headless: true,
                args: ["--no-sandbox"],
                executablePath: "google-chrome-stable",
            }
            : {
                args: ["--no-sandbox"],
            };

        this.clientRef = new Client({
            authStrategy: new LocalAuth({ clientId: this._clientId }),
            puppeteer: {
                // handleSIGINT: false,
                ...puppeteer,
            },
        });

        this.clientRef.on("qr", (qr) => {
            const statusRef =
                "WhatsApp needs to connect, use the following to QR to authorize it." +
                `(Account: ${this.chatwootRef?.config.chatwootAccountId}, Inbox: ${this.chatwootRef?.config.whatsappWebChatwootInboxId})`;

            this.setWhatsappStatusRef(statusRef);

            qrcode.toString(qr, { type: "terminal", small: true }, (err, buffer) => {
                if (!err) {
                    this.setQRRef(buffer);
                    //console.log(buffer);
                } else {
                    console.error(err);
                }
            });

            if (this.chatwootRef?.config.slackToken) {
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
            this.setWhatsappStatusRef(
                "WhatsApp client is ready" +
                    `(Account: ${this.chatwootRef?.config.chatwootAccountId}, Inbox: ${this.chatwootRef?.config.whatsappWebChatwootInboxId})`,
            );
            this.setQRRef("");
        });

        this.clientRef.on("message", async (message) => {
            const isBroadcast = message.broadcast || message.isStatus;
            if (isBroadcast) {
                return false;
            }

            if (this.chatwootRef?.config.ignoreGroupMessages) {
                const chat = await message.getChat();
                if (chat.isGroup) {
                    return false;
                }
            }

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
                        this.chatwootRef.config.remotePrivateMessagePrefix,
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
    }

    public initialize() {
        this.clientRef.initialize().catch((e) => {
            this.setWhatsappStatusRef(
                "Error: Unable to initialize WhatsApp." +
                    `(Account: ${this.chatwootRef?.config.chatwootAccountId}, Inbox: ${this.chatwootRef?.config.whatsappWebChatwootInboxId})`,
            );
        });
    }
}
