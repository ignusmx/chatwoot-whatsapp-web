import fs from "fs";
import dotenv from "dotenv";

const bootstrap = (): Promise<void> => {
    return new Promise<void>((resolve) => {
        if (
            !process.env.PORT
        ) {
            // assert that required envs are set or try to fallback to file
            try {
                fs.accessSync(".env", fs.constants.F_OK);
                dotenv.config();
                resolve();
            } catch {
                console.error("Fatal error: ENV variables aren't set.");
                process.exit(16);
            }
        }
    });
};

export default bootstrap;
