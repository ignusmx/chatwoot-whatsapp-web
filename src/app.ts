require('dotenv').config();

var express = require('express')
const qrcode = require('qrcode-terminal')
const { Client, LocalAuth } = require('whatsapp-web.js')
import { ChatwootAPI } from "./ChatwootAPI";

var expressApp        	     	= express()
var port 			  		 	= process.env.PORT || 8080
var chatwootAPIUrl  		 	= process.env.CHATWOOT_API_URL
var chatwootApiKey			 	= process.env.CHATWOOT_API_KEY
var chatwootAccountId		 	= process.env.CHATWOOT_ACCOUNT_ID
var whatsappWebChatwootInboxId  = process.env.WHATSAPP_WEB_CHATWOOT_INBOX_ID

var whatsappWebClient = new Client({
							authStrategy: new LocalAuth()
						})

var chatwootAPI:ChatwootAPI = new ChatwootAPI(<string>chatwootAPIUrl, 
											  <string>chatwootApiKey, 
											  <string>chatwootAccountId, 
											  <string>whatsappWebChatwootInboxId)

expressApp.use(
	express.urlencoded({
	  extended: true,
	})
);
expressApp.use(express.json());

whatsappWebClient.on('qr', qr => {
    qrcode.generate(qr, {small: true})
})

whatsappWebClient.on('ready', () => {
    console.log('Client is ready!')
})

whatsappWebClient.on('message', message => {
	chatwootAPI.broadcastMessageToChatwoot(message);
})
 
whatsappWebClient.initialize()

expressApp.post('/chatwootMessage', async (req, res) => {
	let chatwootMessage = req.body
	let whatsappWebClientState = await whatsappWebClient.getState()
	if(whatsappWebClientState == "CONNECTED")
	{
		let message = chatwootMessage.messages[0]
		let from = message.sender.name
		let to = chatwootMessage.meta.sender.phone_number.substring(1)+"@c.us"
		whatsappWebClient.sendMessage(to, from+": "+message.content)
	}
  	res.json({ result: 'message_sent_succesfully' })   
})

//init api server
expressApp.listen(port)
console.log('API listening on ' + port)


const { response } = require('express')