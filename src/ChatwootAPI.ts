const axios = require('axios')
export class ChatwootAPI {
	private _headers: object
    private _chatwootAPIUrl: string
	private _chatwootApiKey: string
	private _chatwootAccountId: string
	private _whatsappWebChatwootInboxId: string
 
    constructor(chatwootAPIUrl:string, 
            	chatwootApiKey:string, 
                chatwootAccountId:string, 
                whatsappWebChatwootInboxId:string)
    {
    	this._chatwootAPIUrl = chatwootAPIUrl
		this._chatwootApiKey = chatwootApiKey
		this._chatwootAccountId = chatwootAccountId
		this._whatsappWebChatwootInboxId = whatsappWebChatwootInboxId
		this._headers = {"api_access_token" : this._chatwootApiKey}
    }

	async broadcastMessageToChatwoot(message)
	{
		let inboxId = this._whatsappWebChatwootInboxId
		let sourceId = null
		let chatwootConversation = null
		//get whatsapp contact from message
		let whatsappContact = await message.getContact()
		let query = whatsappContact.number
		let chatwootContact = await this.findChatwootContact(query)
		
		if(chatwootContact == null)
		{
			chatwootContact = await this.makeChatwootContact(inboxId, whatsappContact.name, "+"+whatsappContact.number)
			sourceId = chatwootContact.contact_inbox.source_id
		}
		else{
			chatwootContact.contact_inboxes.forEach(inbox => {
				if(inbox.inbox.id == inboxId)
				{
					sourceId = inbox.source_id
				}
			})
			let chatwootConversations = await this.getChatwootContactConversations(chatwootContact.id)
			chatwootConversations.forEach(async conversation => {
				if(conversation.inbox_id == inboxId){
					chatwootConversation =conversation
				}
			});
		}
	
		if(chatwootConversation == null)
		{
			chatwootConversation = await this.makeChatwootConversation(sourceId, inboxId, chatwootContact.id)
		}
		
	
		let chatwootMessage = await this.postChatwootMessage(message.body, chatwootConversation.id)
	}

	async findChatwootContact(query)
	{
		let chatwootAccountId = this._chatwootAccountId
		let chatwootAPIUrl = this._chatwootAPIUrl
		let headers = this._headers
		let contactSearchEndPoint = 
		'/accounts/'+chatwootAccountId+'/contacts/search?q='+query

		let response = await axios.get(chatwootAPIUrl+contactSearchEndPoint, {headers : headers})
		if(response.data.payload.length > 0)
		{
			return response.data.payload[0]
		}
		return null
	}

	async makeChatwootContact(inboxId, name, phoneNumber){
		let chatwootAccountId = this._chatwootAccountId
		let chatwootAPIUrl = this._chatwootAPIUrl
		let headers = this._headers
		let contactsEndPoint = 
		'/accounts/'+chatwootAccountId+'/contacts'
	
		let contactPayload = 
		{
			"inbox_id": inboxId,
			"name": name,
			"phone_number": phoneNumber
		}
	
		let response = await axios.post(chatwootAPIUrl+contactsEndPoint, contactPayload, {headers : headers})
		return response.data.payload
	}

	async makeChatwootConversation(sourceId, inboxId, contactId){
		let chatwootAccountId = this._chatwootAccountId
		let chatwootAPIUrl = this._chatwootAPIUrl
		let headers = this._headers
		let conversationsEndPoint = 
		'/accounts/'+chatwootAccountId+'/conversations'
	
		let conversationPayload = 
		{
			"source_id": sourceId,
			"inbox_id": inboxId,
			"contact_id": contactId
		}
	
		let response = await axios.post(chatwootAPIUrl+conversationsEndPoint, conversationPayload, {headers : headers})
		return response.data
	}
	
	async postChatwootMessage(message, conversationId){
		let chatwootAccountId = this._chatwootAccountId
		let chatwootAPIUrl = this._chatwootAPIUrl
		let headers = this._headers
		let messagesEndPoint = 
		'/accounts/'+chatwootAccountId+'/conversations/'+conversationId+'/messages'
		
		let messagePayload = 
		{
			"content": message,
			"message_type": "incoming",
			"private": false
		}
	
		let response = await axios.post(chatwootAPIUrl+messagesEndPoint, messagePayload, {headers : headers})
		return response.data
	}
	
	async getChatwootContactConversations(contactId)
	{
		let chatwootAccountId = this._chatwootAccountId
		let chatwootAPIUrl = this._chatwootAPIUrl
		let headers = this._headers
		let messagesEndPoint = 
		'/accounts/'+chatwootAccountId+'/contacts/'+contactId+'/conversations'
	
		let response = await axios.get(chatwootAPIUrl+messagesEndPoint, {headers : headers})
		return response.data.payload
	}
}