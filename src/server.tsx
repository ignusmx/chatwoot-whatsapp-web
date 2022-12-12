import express from "express";
import React from "react";
import { render } from "ink";
import App from "./components/app";
import bootstrap from "./core/bootstrap";

// run a bootstrap function once to perform an app-wide initialization
bootstrap().then(() => {
    const expressApp = express();

    expressApp.use(
        express.json(),
        express.urlencoded({
            extended: true,
        })
    );

    // init api server
    const server = expressApp.listen(process.env.PORT ?? "", () => {
        // on success, render our App react component
        render(<App express={expressApp} server={server} />);
    });
});
