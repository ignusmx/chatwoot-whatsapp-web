import axios, { AxiosRequestHeaders } from "axios";
import { Message, Chat, GroupChat, Client, Contact } from "whatsapp-web.js";
import FormData from "form-data";
import MimeTypes from "mime-types";

export class ChatwootAPI {
    private headers: AxiosRequestHeaders | undefined;
    private chatwootAPIUrl: string;
    private chatwootApiKey: string;
    private chatwootAccountId: string;
    private whatsappWebChatwootInboxId: string;
    private whatsappWebGroupParticipantsAttributeName: string;
    private whatsappWebClient: Client;

    constructor(
        chatwootAPIUrl: string,
        chatwootApiKey: string,
        chatwootAccountId: string,
        whatsappWebChatwootInboxId: string,
        whatsappWebGroupParticipantsAttributeName: string,
        whatsappWebClient: Client
    ) {
        this.chatwootAPIUrl = chatwootAPIUrl;
        this.chatwootApiKey = chatwootApiKey;
        this.chatwootAccountId = chatwootAccountId;
        this.whatsappWebChatwootInboxId = whatsappWebChatwootInboxId;
        this.whatsappWebClient = whatsappWebClient;
        this.whatsappWebGroupParticipantsAttributeName = whatsappWebGroupParticipantsAttributeName;
        this.headers = { api_access_token: this.chatwootApiKey };
    }

    async broadcastMessageToChatwoot(message: Message, type: string, attachment: any, messagePrefix: string | undefined) {
        const { whatsappWebChatwootInboxId } = this;

        let chatwootConversation: any = null;
        let sourceId: string | number = "";
        let contactNumber = "";
        let contactName = "";
        const messageChat: Chat = await message.getChat();
        const contactIdentifier = `${messageChat.id.user}@${messageChat.id.server}`;

        //we use the chat name as the chatwoot contact name
        //when chat is private, the name of the chat represents the contact's name
        //when chat is group, the name of the chat represents the group name
        contactName = messageChat.name;

        //if chat is group chat, whe use the name@groupId as the query to search for the contact
        //otherwhise we search by phone number
        if (!messageChat.isGroup) {
            contactNumber = `+${messageChat.id.user}`;
        }

        let chatwootContact = await this.findChatwootContactByIdentifier(contactIdentifier);

        if (chatwootContact == null) {
            chatwootContact = await this.findChatwootContactByPhone(contactNumber);

            if (chatwootContact == null) {
                chatwootContact = await this.makeChatwootContact(
                    whatsappWebChatwootInboxId,
                    contactName,
                    contactNumber,
                    contactIdentifier
                );
            } else {
                //small improvement to update identifier on contacts who don't have WA identifier
                const updatedData = { identifier: contactIdentifier };
                await this.updateChatwootContact(chatwootContact.id, updatedData);
            }

            sourceId = chatwootContact.contact_inbox.source_id;
        } else {
            chatwootContact.contact_inboxes.forEach((inbox: { inbox: { id: string | number }; source_id: string | number }) => {
                if (inbox.inbox.id == whatsappWebChatwootInboxId) {
                    sourceId = inbox.source_id;
                }
            });
            chatwootConversation = await this.getChatwootContactConversationByInboxId(
                chatwootContact.id,
                whatsappWebChatwootInboxId
            );
        }

        if (chatwootConversation == null) {
            chatwootConversation = await this.makeChatwootConversation(
                sourceId,
                whatsappWebChatwootInboxId,
                chatwootContact.id
            );

            //we set the group members if conversation is a group chat
            if (messageChat.isGroup) {
                this.updateChatwootConversationGroupParticipants(messageChat as GroupChat);
            }
        }

        //if message to post on chatwoot is outgoing
        //it means it was created from other WA cliente (web or device)
        //therefore we mark it as private so we can filter it
        //when receiving it from the webhook (in later steps) to avoid duplicated messages
        let isPrivate = false;
        if (type == "outgoing") {
            isPrivate = true;
        }

        await this.postChatwootMessage(
            chatwootConversation.id as string,
            message.body,
            type,
            isPrivate,
            messagePrefix,
            attachment
        );
    }

    async findChatwootContactByIdentifier(identifier: string) {
        const contacts = await this.searchChatwootContacts(identifier);
        if (contacts.length > 0) {
            for (const contact of contacts) {
                //in order to retrieve a chatwoot contact by identifier,
                //we search contacts with query, however this can get false positives
                //since query searches for the value in several fields, not just identifier
                //so we add extra validation to ensure the retrieved contact's identifier
                //actually matches searched one
                if (contact.identifier == identifier) {
                    return contact;
                }
            }
        }
        return null;
    }

    async findChatwootContactByPhone(phone: string) {
        const contacts = await this.searchChatwootContacts(phone);
        if (contacts.length > 0) {
            for (const contact of contacts) {
                //in order to retrieve a chatwoot contact by phone,
                //we search contacts with query, however this can get false positives
                //since query searches for the value in several fields, not just phone number
                //so we add extra validation to ensure the retrieved contact's phone number
                //actually matches searched one
                if (contact.phone_number == phone) {
                    return contact;
                }
            }
        }
        return null;
    }

    async searchChatwootContacts(query: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactSearchEndPoint = `/accounts/${chatwootAccountId}/contacts/search?q=${query}`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + contactSearchEndPoint, { headers: headers });

        return payload;
    }

    async getChatwootContactById(id: string) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactSearchEndPoint = `/accounts/${chatwootAccountId}/contacts/${id}`;

        const {
            data: { payload },
        } = await axios.get(chatwootAPIUrl + contactSearchEndPoint, { headers: headers });

        return payload;
    }

    async makeChatwootContact(inboxId: string | number, name: string, phoneNumber: string, identifier: string | undefined) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactsEndPoint = `/accounts/${chatwootAccountId}/contacts`;

        const contactPayload = {
            inbox_id: inboxId,
            name: name,
            phone_number: phoneNumber,
            identifier: identifier,
        };

        const {
            data: { payload },
        } = <{ data: Record<string, unknown> }>(
            await axios.post(chatwootAPIUrl + contactsEndPoint, contactPayload, { headers: headers })
        );
        return payload;
    }

    async updateChatwootContact(contactId: string | number, updatedData: any) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const contactsEndPoint = `/accounts/${chatwootAccountId}/contacts/${contactId}`;

        const {
            data: { payload },
        } = <{ data: Record<string, unknown> }>(
            await axios.put(chatwootAPIUrl + contactsEndPoint, updatedData, { headers: headers })
        );
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

        const { data } = <{ data: Record<string, unknown> }>(
            await axios.post(chatwootAPIUrl + conversationsEndPoint, conversationPayload, { headers: headers })
        );
        return data;
    }

    async updateChatwootConversationGroupParticipants(whatsappGroupChat: GroupChat) {
        const { whatsappWebClient } = this;
        const contactIdentifier = `${whatsappGroupChat.id.user}@${whatsappGroupChat.id.server}`;

        const participantLabels: Array<string> = [];
        for (const participant of whatsappGroupChat.participants) {
            const participantIdentifier = `${participant.id.user}@${participant.id.server}`;
            const participantContact: Contact = await whatsappWebClient.getContactById(participantIdentifier);
            const participantName: string =
                participantContact.name ?? participantContact.pushname ?? "+" + participantContact.number;
            const participantLabel = `[${participantName} - +${participantContact.number}]`;
            participantLabels.push(participantLabel);
        }
        const conversationCustomAttributes = {
            custom_attributes: { [this.whatsappWebGroupParticipantsAttributeName]: participantLabels.join(",") },
        };

        const chatwootContact = await this.findChatwootContactByIdentifier(contactIdentifier);
        const chatwootConversation = await this.getChatwootContactConversationByInboxId(
            chatwootContact.id,
            this.whatsappWebChatwootInboxId
        );
        this.updateChatwootConversationCustomAttributes(chatwootConversation.id, conversationCustomAttributes);
    }

    async updateChatwootConversationCustomAttributes(conversationId: string | number, customAttributes: any) {
        const { chatwootAccountId, chatwootAPIUrl, headers } = this;
        const conversationsEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/custom_attributes`;

        const { data } = <{ data: Record<string, unknown> }>(
            await axios.post(chatwootAPIUrl + conversationsEndPoint, customAttributes, { headers: headers })
        );
        return data;
    }

    async postChatwootMessage(
        conversationId: string | number,
        message: string,
        type: string,
        isPrivate = false,
        messagePrefix?: string,
        attachment?: any
    ) {
        const { chatwootAccountId, chatwootAPIUrl } = this;
        const messagesEndPoint = `/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`;

        const bodyFormData: FormData = new FormData();
        if (messagePrefix != null) {
            message = messagePrefix + message;
        }

        bodyFormData.append("content", message);
        bodyFormData.append("message_type", type);
        bodyFormData.append("private", isPrivate.toString());

        const headers: AxiosRequestHeaders = { ...this.headers, ...bodyFormData.getHeaders() };

        if (attachment != null) {
            const buffer = Buffer.from(attachment.data, "base64");
            const extension = MimeTypes.extension(attachment.mimetype);
            const attachmentFilename = attachment.filename ?? "attachment." + extension;
            bodyFormData.append("attachments[]", buffer, attachmentFilename);
        }

        const { data } = <{ data: Record<string, unknown> }>await axios.postForm(
            chatwootAPIUrl + messagesEndPoint,
            bodyFormData,
            {
                headers: headers,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            }
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

    async getChatwootContactConversationByInboxId(contactId: string | number, inboxId: string | number) {
        const chatwootConversations = await this.getChatwootContactConversations(contactId);
        const chatwootConversation = chatwootConversations.find((conversation: any) => {
            return conversation.inbox_id == inboxId;
        });

        return chatwootConversation;
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
