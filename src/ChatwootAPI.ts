import axios, { AxiosRequestHeaders } from "axios";
import { Message } from "whatsapp-web.js";

export class ChatwootAPI {
    private headers: AxiosRequestHeaders | undefined;
    private chatwootAPIUrl: string;
    private chatwootApiKey: string;
    private chatwootAccountId: string;
    private whatsappWebChatwootInboxId: string;

    constructor(chatwootAPIUrl: string, chatwootApiKey: string, chatwootAccountId: string, whatsappWebChatwootInboxId: string) {
        this.chatwootAPIUrl = chatwootAPIUrl;
        this.chatwootApiKey = chatwootApiKey;
        this.chatwootAccountId = chatwootAccountId;
        this.whatsappWebChatwootInboxId = whatsappWebChatwootInboxId;
        this.headers = { api_access_token: this.chatwootApiKey };
    }

    async broadcastMessageToChatwoot(message: Message) {
        const { whatsappWebChatwootInboxId } = this;

        let sourceId = null;
        let chatwootConversation = null;
        //get whatsapp contact from message
        const whatsappContact = await message.getContact();
        const query = whatsappContact.number;
        let chatwootContact = await this.findChatwootContact(query);

        if (chatwootContact == null) {
            chatwootContact = await this.makeChatwootContact(
                whatsappWebChatwootInboxId,
                `${whatsappContact.name ?? ""}`,
                `+${whatsappContact.number}`
            );
            sourceId = chatwootContact.contact_inbox.source_id;
        } else {
            chatwootContact.contact_inboxes.forEach((inbox: { inbox: { id: string | number }; source_id: string | number }) => {
                if (inbox.inbox.id == whatsappWebChatwootInboxId) {
                    sourceId = inbox.source_id;
                }
            });
            const chatwootConversations = await this.getChatwootContactConversations(chatwootContact.id);

            chatwootConversations.forEach(async (conversation: { inbox_id: string | number }) => {
                if (conversation.inbox_id == whatsappWebChatwootInboxId) {
                    chatwootConversation = conversation;
                }
            });
        }

        if (chatwootConversation == null) {
            chatwootConversation = await this.makeChatwootConversation(
                sourceId,
                whatsappWebChatwootInboxId,
                chatwootContact.id
            );
        }

        await this.postChatwootMessage(message.body, chatwootConversation.id as string);
    }

    async findChatwootContact(query: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactSearchEndPoint = `/accounts/${chatwootAccountId}/contacts/search?q=${query}`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + contactSearchEndPoint, { headers: headers });
        if (payload.length > 0) {
            return payload[0];
        }
        return null;
    }

    async makeChatwootContact(inboxId: string | number, name: string, phoneNumber: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactsEndPoint = `/accounts/${chatwootAccountId}/contacts`;

        const contactPayload = {
            inbox_id: inboxId,
            name: name,
            phone_number: phoneNumber,
        };

        const {
            data: { payload },
        } = <{ data: Record<string, unknown> }> await axios.post(chatwootAPIUrl + contactsEndPoint, contactPayload, { headers: headers });
        return payload;
    }

    async makeChatwootConversation(sourceId: string | number, inboxId: string, contactId: string | number) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const conversationsEndPoint = `/accounts/${chatwootAccountId}/conversations`;

        const conversationPayload = {
            source_id: sourceId,
            inbox_id: inboxId,
            contact_id: contactId,
        };

        const { data } = <{ data: Record<string, unknown> }> await axios.post(chatwootAPIUrl + conversationsEndPoint, conversationPayload, { headers: headers });
        return data;
    }

    async postChatwootMessage(message: string, conversationId: string | number) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`;

        const messagePayload = {
            content: message,
            message_type: "incoming",
            private: false,
        };

        const { data } = <{ data: Record<string, unknown> }>(
            await axios.post(chatwootAPIUrl + messagesEndPoint, messagePayload, { headers: headers })
        );
        return data;
    }

    async getChatwootContactConversations(contactId: string | number) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/contacts/${contactId}/conversations`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + messagesEndPoint, { headers: headers });
        return payload;
    }
}
