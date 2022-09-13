import axios, { AxiosRequestHeaders } from "axios";
import { Message,Contact, Chat, GroupChat } from "whatsapp-web.js";
import FormData from "form-data";
import MimeTypes from "mime-types";

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

    async broadcastMessageToChatwoot(message: Message, type: string, attachment : any, remotePrivateMessagePrefix:string | undefined) {
        const { whatsappWebChatwootInboxId } = this;

        let chatwootConversation:any = null;
        let sourceId:string|number = "";
        let contactNumber = "";
        let contactName = "";
        const messageChat:Chat = await message.getChat();
        const contactIdentifier = `${messageChat.id.user}@${messageChat.id.server}`;
        
        //we use the chat name as the chatwoot contact name
        //when chat is private, the name of the chat represents the contact's name
        //when chat is group, the name of the chat represents the group name
        contactName = messageChat.name;

        //if chat is group chat, whe use the name@groupId as the query to search for the contact
        //otherwhise we search by phone number
        if(!messageChat.isGroup)
        {   
            contactNumber = `+${messageChat.id.user}`;
        }
        
        let chatwootContact = await this.findChatwootContact(contactIdentifier);

        if (chatwootContact == null) {
            chatwootContact = await this.findChatwootContact(contactNumber);
            if(chatwootContact == null)
            {
                chatwootContact = await this.makeChatwootContact(
                    whatsappWebChatwootInboxId,
                    contactName,
                    contactNumber,
                    contactIdentifier
                );
            }
            else
            {
                //small improvement to update identifier on contacts who don't have WA identifier
                const updatedData = {identifier : contactIdentifier};
                await this.updateChatwootContact(chatwootContact.id, updatedData);
            }
            
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

        await this.postChatwootMessage(chatwootConversation.id as string, message.body, type, attachment, remotePrivateMessagePrefix);
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

    async getChatwootContactById(id: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactSearchEndPoint = `/accounts/${chatwootAccountId}/contacts/${id}`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + contactSearchEndPoint, { headers: headers });

        return payload;
    }

    async makeChatwootContact(inboxId: string | number, name: string, phoneNumber: string, identifier:string | undefined) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactsEndPoint = `/accounts/${chatwootAccountId}/contacts`;

        const contactPayload = {
            inbox_id: inboxId,
            name: name,
            phone_number: phoneNumber,
            identifier : identifier
        };

        const {
            data: { payload },
        } = <{ data: Record<string, unknown> }> await axios.post(chatwootAPIUrl + contactsEndPoint, contactPayload, { headers: headers });
        return payload;
    }

    async updateChatwootContact(contactId: string | number, updatedData : any) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactsEndPoint = `/accounts/${chatwootAccountId}/contacts/${contactId}`;

        const {
            data: { payload },
        } = <{ data: Record<string, unknown> }> await axios.put(chatwootAPIUrl + contactsEndPoint, updatedData, { headers: headers });
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

    async postChatwootMessage(conversationId: string | number, message: string, type: string, attachment:any, remotePrivateMessagePrefix = "REMOTE: ") {
        const { chatwootAccountId, chatwootAPIUrl } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`;
        
        const bodyFormData:FormData = new FormData();
        let isPrivate = "false";

        //if message to post on chatwoot is outgoing
        //it means it was created from other WA cliente (web or device)
        //therefore we mark it as private so we can filter it
        //when receiving it from the webhook (in later steps) to avoid duplicated messages
        if(type == "outgoing")
        {
            isPrivate = "true";
            message = remotePrivateMessagePrefix+message;
        }

        bodyFormData.append("content", message);
        bodyFormData.append("message_type", type);
        bodyFormData.append("private", isPrivate);
        
        const headers:AxiosRequestHeaders = { ...this.headers, ...bodyFormData.getHeaders() };
        
        if(attachment != null)
        {
            const buffer = Buffer.from(attachment.data, "base64");
            const extension = MimeTypes.extension(attachment.mimetype);
            const attachmentFilename = attachment.filename ?? "attachment."+extension;
            bodyFormData.append("attachments[]", buffer, attachmentFilename);
        }
        
        const { data } = <{ data: Record<string, unknown> }>(
            await axios.postForm(chatwootAPIUrl + messagesEndPoint, bodyFormData, { headers: headers, maxContentLength: Infinity,
                maxBodyLength: Infinity })
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

    async getChatwootConversationMessages(conversationId: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + messagesEndPoint, { headers: headers });
        return payload;
    }
}
