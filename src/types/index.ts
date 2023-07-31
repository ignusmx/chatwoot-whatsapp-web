export interface ChatwootMessage {
    additionalAttributes?: AdditionalAttributes;
    canReply?: boolean;
    channel?: string;
    contactInbox?: ContactInbox;
    id?: number;
    inboxID?: number;
    messages?: Message[];
    meta?: Meta;
    status?: string;
    customAttributes?: AdditionalAttributes;
    snoozedUntil?: null;
    unreadCount?: number;
    agentLastSeenAt?: number;
    contactLastSeenAt?: number;
    timestamp?: number;
    event?: string;
}

export interface AdditionalAttributes {
    [key: string]: unknown;
}

export interface ContactInbox {
    id?: number;
    contactID?: number;
    inboxID?: number;
    sourceID?: string;
    createdAt?: Date;
    updatedAt?: Date;
    hmacVerified?: boolean;
    pubsubToken?: string;
}

export interface Message {
    id?: number;
    content?: string;
    accountID?: number;
    inboxID?: number;
    conversationID?: number;
    messageType?: number;
    createdAt?: number;
    updatedAt?: Date;
    private?: boolean;
    status?: string;
    sourceID?: null;
    contentType?: string;
    contentAttributes?: AdditionalAttributes;
    senderType?: string;
    senderID?: number;
    externalSourceIDS?: AdditionalAttributes;
    additionalAttributes?: AdditionalAttributes;
    conversation?: Conversation;
    sender?: MessageSender;
}

export interface Conversation {
    assigneeID?: null;
}

export interface MessageSender {
    id?: number;
    name?: string;
    availableName?: string;
    avatarURL?: string;
    type?: string;
    availabilityStatus?: null;
    thumbnail?: string;
}

export interface Meta {
    sender?: MetaSender;
    assignee?: null;
    team?: null;
    hmacVerified?: boolean;
}

export interface MetaSender {
    additionalAttributes?: AdditionalAttributes;
    customAttributes?: AdditionalAttributes;
    email?: null;
    id?: number;
    identifier?: null;
    name?: string;
    phoneNumber?: string;
    thumbnail?: string;
    type?: string;
}

export interface ChatwootAPIConfig {
    authToken: string;
    prefixAgentNameOnMessages: boolean;
    chatwootAPIUrl: string;
    chatwootAccessToken: string;
    chatwootAccountId: number;
    whatsappWebChatwootInboxId: number;
    whatsappWebGroupParticipantsCustomField: string;
    slackToken: string;
    remotePrivateMessagePrefix: string;
    ignoreGroupMessages: boolean;
    messageTemplate: string
}

declare global { 
    interface String { 
        format(...args: any[]): string;
    } 
}

String.prototype.format = function (...args: any[]): string {
    return this.replace(/{(\d+)}/g, function (match, number) {
        return typeof args[number] != 'undefined'
            ? args[number]
            : match
            ;
    });
};