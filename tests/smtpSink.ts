import { SMTPServer } from "smtp-server";

/**
 * A throwaway SMTP server the tests point providers at.
 *
 * Delivery is tested against a real socket rather than a stubbed transport, so
 * the nodemailer wiring, the address mapping and the "acceptance is delivery
 * status `sent`" rule are all exercised for real.
 */

export type SinkT = {
  port: number;
  messages: Array<{ from: string; to: Array<string>; data: string }>;
  /** Make the next N deliveries fail at DATA, to exercise the retry policy. */
  failNext: (count: number) => void;
  /**
   * Run something the moment a message is accepted - the seam a test uses to
   * change the world underneath a sender that is mid-batch.
   */
  onMessage: (fn: () => void) => void;
  close: () => Promise<void>;
};

export const startSmtpSink = async (): Promise<SinkT> => {
  const messages: SinkT["messages"] = [];
  let failures = 0;
  let hook: (() => void) | undefined;

  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, callback) {
      const chunks: Array<Buffer> = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        if (failures > 0) {
          failures -= 1;
          callback(new Error("451 sink was told to fail"));
          return;
        }
        messages.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
          to: session.envelope.rcptTo.map(({ address }) => address),
          data: Buffer.concat(chunks).toString("utf8"),
        });
        hook?.();
        callback();
      });
    },
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.server.address();
      if (address && typeof address === "object") resolve(address.port);
      else reject(new Error("SMTP sink did not report a port"));
    });
  });

  return {
    port,
    messages,
    failNext: (count) => {
      failures = count;
    },
    onMessage: (fn) => {
      hook = fn;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
};
