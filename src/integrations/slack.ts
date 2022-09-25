import { Readable } from "stream";
import FormData from "form-data";
import axios from "axios";

export default class Slack {
    public static broadcastQR = (buffer: Buffer) => {
        const form = new FormData();

        form.append("token", process.env.SLACK_TOKEN ?? "");
        form.append("channels", process.env.SLACK_CHANNEL_ID ?? "");
        form.append("title", "QR Code");
        form.append("initial_comment", "WahtsApp needs to connect, use this code to authorize your number:");
        form.append(
            "file",
            new Readable({
                read() {
                    this.push(buffer);
                    this.push(null);
                },
            }),
            "qr.png"
        );

        axios
            .postForm("https://slack.com/api/files.upload", form, {
                headers: form.getHeaders(),
            })
            .then((response) => {
                console.log(response.data);
            })
            .catch((err) => {
                console.error(err);
            });
    };
}
