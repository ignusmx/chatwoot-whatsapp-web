import { Express } from "express";
import { Server } from "http";
import { ChatwootAPI } from "../services/chatwootAPI";
import React, { useState, useEffect } from "react";
import { Box, Newline, Text } from "ink";
import WhatsApp from "../services/whatsapp";
import ExpressRoutes from "../services/expressRoutes";
import { ChatwootAPIConfig } from "../types";
import fs from "fs";

interface AppProps {
    express: Express;
    server: Server;
}

const accountsConfig = JSON.parse(fs.readFileSync("./accounts-config.json").toString());
const accounts = accountsConfig.accounts;

const App = (props: AppProps) => {
    const { express, server } = props;
    const [whatsappStatus, setWhatsappStatus] = useState("Loading accounts config file...");
    const [appStatus, setAppStatus] = useState("Press ctrl+c to stop.");
    const [qr, setQr] = useState("");

    let pendingInitWhatsappClients: Array<WhatsApp> = [];

    useEffect(() => {
        let chatwootAPIMap: any = {};
        for (const account of accounts) {
            for (const whatsappWebInbox of account.whatsappWebInboxes) {
                const chatwootConfig: ChatwootAPIConfig = {
                    authToken: account.authToken,
                    chatwootAPIUrl: account.chatwootAPIUrl,
                    chatwootAccessToken: account.chatwootAccessToken,
                    chatwootAccountId: account.id,
                    whatsappWebGroupParticipantsCustomField: account.whatsappWebGroupParticipantsCustomField,
                    whatsappWebChatwootInboxId: whatsappWebInbox.id,
                    prefixAgentNameOnMessages: whatsappWebInbox.prefixAgentNameOnMessages,
                    ignoreGroupMessages: whatsappWebInbox.ignoreGroupMessages,
                    messageTemplate: whatsappWebInbox.templateMessage,
                    slackToken: whatsappWebInbox.slackToken,
                    remotePrivateMessagePrefix: whatsappWebInbox.remotePrivateMessagePrefix,
                };

                const whatsappClient = new WhatsApp(
                    `inbox_${chatwootConfig.whatsappWebChatwootInboxId}`,
                    setWhatsappStatus,
                    setQr
                );

                whatsappClient.client.on("ready", () => {
                    pendingInitWhatsappClients.shift();

                    if (pendingInitWhatsappClients.length > 0) {
                        setWhatsappStatus(
                            "WhatsApp Web client succesfully initialized. Initializing WhatsApp Web Client for next inbox..." +
                                `(Account: ${pendingInitWhatsappClients[0].chatwoot?.config.chatwootAccountId}, Inbox: ${pendingInitWhatsappClients[0].chatwoot?.config.whatsappWebChatwootInboxId})`
                        );
                        pendingInitWhatsappClients[0].initialize();
                    } else {
                        setWhatsappStatus(`All WhatsApp Web clients succesfully initialized.`);
                    }
                });

                pendingInitWhatsappClients.push(whatsappClient);

                const chatwootAPI: ChatwootAPI = new ChatwootAPI(chatwootConfig, whatsappClient);
                chatwootAPIMap[whatsappWebInbox.id] = chatwootAPI;
            }
        }

        setWhatsappStatus(
            "Initializing WhatsApp Web Client for Inbox..." +
                `(Account: ${pendingInitWhatsappClients[0].chatwoot?.config.chatwootAccountId}, Inbox: ${pendingInitWhatsappClients[0].chatwoot?.config.whatsappWebChatwootInboxId})`
        );
        ExpressRoutes.configure(express, chatwootAPIMap);

        pendingInitWhatsappClients[0].initialize();

        // add gracefull closing
        process.on("SIGINT", async () => {
            setAppStatus("SIGINT signal received: closing HTTP server...");

            server.close(() => {
                for (const inboxId in chatwootAPIMap) {
                    const chatwootAPI: ChatwootAPI = chatwootAPIMap[inboxId];
                    chatwootAPI.whatsapp.client.destroy().finally(() => {
                        setAppStatus("Server closed.");
                        process.exitCode = 0;
                        process.exit(0);
                    });
                }
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

export default App;
