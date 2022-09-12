import axios, { AxiosRequestHeaders } from "axios";
import { Message, Contact, MessageMedia } from "whatsapp-web.js";
import FormData from "form-data";
import MimeTypes from "mime-types";
import ChatwootClient, { extended_contact, contact_conversations, conversation } from "@figuro/chatwoot-sdk";


export class ChatwootAPI {
    private headers: AxiosRequestHeaders | undefined;
    private chatwootAPIUrl: string;
    private chatwootApiKey: string;
    private chatwootAccountId: number;
    private whatsappWebChatwootInboxId: number;
    private chatwoot: ChatwootClient;

    constructor(chatwootAPIUrl: string, chatwootApiKey: string, chatwootAccountId: string, whatsappWebChatwootInboxId: string) {
        this.chatwootAPIUrl = chatwootAPIUrl;
        this.chatwootApiKey = chatwootApiKey;
        this.chatwootAccountId = parseInt(chatwootAccountId);
        this.whatsappWebChatwootInboxId = parseInt(whatsappWebChatwootInboxId);
        this.headers = { api_access_token: this.chatwootApiKey };

        this.chatwoot = new ChatwootClient({ config: {
            basePath: chatwootAPIUrl,
            with_credentials: true,
            credentials: "include",
            token: chatwootApiKey
        }});
    }

    async broadcastMessageToChatwoot(message: Message, type: "outgoing" | "incoming", attachment: MessageMedia | undefined ) {
        const { whatsappWebChatwootInboxId } = this;

        let chatwootConversation: conversation | contact_conversations | undefined = undefined;
        let sourceId: string | undefined = "";
        let contactNumber = "";
        let contactName = "";

        // get whatsapp contact from message if it is an incoming message
        if (type == "incoming") {
            const whatsappContact: Contact = await message.getContact();
            contactNumber = whatsappContact.number;
            contactName = whatsappContact.name ?? whatsappContact.pushname ?? "+" + whatsappContact.number;
        } else if (type == "outgoing") {
            contactNumber = message.to.split("@")[0];
            contactName = contactNumber;
        }

        let chatwootContact = await this.findChatwootContact(contactNumber);

        if (chatwootContact == null) {
            chatwootContact = await this.makeChatwootContact(whatsappWebChatwootInboxId, contactName, `+${contactNumber}`);
            sourceId = chatwootContact?.contact_inboxes?.pop()?.source_id;
        } else {
            chatwootContact.contact_inboxes?.forEach((inbox) => {
                if (inbox.inbox?.id == whatsappWebChatwootInboxId) {
                    sourceId = inbox.source_id;
                }
            });
            const chatwootConversations = await this.getChatwootContactConversations(chatwootContact.id ?? -1);

            chatwootConversations.forEach(async (conversation) => {
                if (conversation.inbox_id == whatsappWebChatwootInboxId) {
                    chatwootConversation = conversation;
                }
            });
        }

        chatwootConversation = chatwootConversation ?? await this.makeChatwootConversation(
            sourceId,
            whatsappWebChatwootInboxId.toString(),
            chatwootContact.id?.toString()
        );
        await this.postChatwootMessage(chatwootConversation?.id??-1, message.body, type, attachment);
    }

    async findChatwootContact(query: string): Promise<extended_contact> {
        const { chatwootAccountId, chatwoot } = this;
        
        return new Promise<extended_contact>((resolve, reject) => {
            chatwoot.contacts.contactSearch({ 
                accountId: chatwootAccountId,
                q: query
            }).then(result => {
                const { payload } = result;
            
                payload && payload.length
                    ? resolve(payload[0])
                    : reject();
            });
        });
    }

    async makeChatwootContact(inboxId: number, name: string, phoneNumber: string): Promise<extended_contact> {
        const { chatwootAccountId, chatwoot } = this;

        return new Promise<extended_contact>(resolve => {
            chatwoot.contacts.createContact({
                accountId: chatwootAccountId,
                data: {
                    inbox_id: inboxId,
                    name: name,
                    phone_number: phoneNumber,
                }
            }).then(contactPayload => {
                resolve(contactPayload);
            });
        });
    }

    async makeChatwootConversation(sourceId: string | undefined, inboxId: string | undefined, contactId: string | undefined): Promise<conversation> {
        const { chatwootAccountId, chatwoot } = this;

        return new Promise<conversation>(resolve => {
            chatwoot.conversations.createConversation({
                accountId: chatwootAccountId,
                data: {
                    source_id: sourceId,
                    inbox_id: inboxId,
                    contact_id: contactId,
                }
            }).then(result => {
                resolve (result);
            });
        });
        
    }

    async postChatwootMessage(conversationId: number, message: string, type: "outgoing" | "incoming" | undefined, attachment: any) {
        const { chatwootAccountId, chatwootAPIUrl } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`;
        const bodyFormData: FormData = new FormData();

        bodyFormData.append("content", message);
        bodyFormData.append("message_type", type);
        bodyFormData.append("private", "false");

        if (type == "outgoing") {
            console.log("outgoing");
            bodyFormData.append("custom_attributes[\"isWARemoteMessage\"]", "true");
            bodyFormData.append("additional_attributes[\"isWARemoteMessage\"]", "true");
            bodyFormData.append("content_attributes[\"isWARemoteMessage\"]", "true");
        }

        const headers: AxiosRequestHeaders = { ...this.headers, ...bodyFormData.getHeaders() };

        if (attachment != null) {
            const buffer = Buffer.from(attachment.data, "base64");
            const extension = MimeTypes.extension(attachment.mimetype);
            const attachmentFilename = attachment.filename ?? "attachment." + extension;
            bodyFormData.append("attachments[]", buffer, attachmentFilename);
        }

        const { data } = <{ data: Record<string, unknown> }> await axios.postForm(
            chatwootAPIUrl + messagesEndPoint,
            bodyFormData,
            {
                headers,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
        );

        return data;
    }

    async getChatwootContactConversations(contactId: number): Promise<contact_conversations> {
        const { chatwootAccountId, chatwoot } = this;

        return new Promise<contact_conversations>(resolve => {
            chatwoot.contacts.contactConversations({
                accountId: chatwootAccountId,
                id: contactId
            }).then(result => {
                resolve(result);
            });
        });
    }
}
