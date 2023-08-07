interface String {
    format(...args: any[]): string;
}

String.prototype.format = function (...args: any[]): string {
    return this.replace(/{(\d+)}/g, function (match, number) {
        return typeof args[number] != "undefined" ? args[number] : match;
    });
};
