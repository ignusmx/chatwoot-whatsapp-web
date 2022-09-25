import { Express } from "express";
import { Server } from "http";
import { ChatwootAPI } from "../services/chatwootAPI";
import React, { useState, useEffect } from "react";
import { Box, Newline, Text } from "ink";
import WhatsApp from "../services/whatsapp";
import ExpressRoutes from "../services/expressRoutes";

interface AppProps {
    express: Express;
    server: Server;
}

const App = (props: AppProps) => {
    const { express, server } = props;
    const [whatsappStatus, setWhatsappStatus] = useState("Initializing WhatsApp Web...");
    const [appStatus, setAppStatus] = useState("Press ctrl+c to stop.");
    const [qr, setQr] = useState("");

    useEffect(() => {
        const whatsappClient = new WhatsApp(setWhatsappStatus, setQr);

        const chatwootAPI: ChatwootAPI = new ChatwootAPI(
            process.env.CHATWOOT_API_URL ?? "",
            process.env.CHATWOOT_API_KEY ?? "",
            process.env.CHATWOOT_ACCOUNT_ID ?? "",
            process.env.CHATWOOT_WW_INBOX_ID ?? "",
            process.env.CHATWOOT_WW_GROUP_PARTICIPANTS_ATTRIBUTE_NAME ?? "",
            whatsappClient.client
        );

        whatsappClient.chatwoot = chatwootAPI;

        ExpressRoutes.configure(express, whatsappClient, chatwootAPI);

        // add gracefull closing
        process.on("SIGINT", async () => {
            setAppStatus("SIGINT signal received: closing HTTP server...");

            server.close(() => {
                whatsappClient.client.destroy().finally(() => {
                    setAppStatus("Server closed.");
                    process.exitCode = 0;
                    process.exit(0);
                });
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
