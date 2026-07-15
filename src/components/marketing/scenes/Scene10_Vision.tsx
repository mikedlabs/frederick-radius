"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, CircleAlert, LoaderCircle, Mail } from "lucide-react";
import { GradientText } from "@/components/ui/gradient-text";

type SubmissionState = "idle" | "sending" | "sent" | "stored" | "error";

type BetaEmailResponse = {
    sent?: boolean;
    stored?: boolean;
    error?: string;
};

/**
 * SCENE 10: THE VISION
 * Uses the real beta-email endpoint and confirms success only after the server
 * says the access email was accepted for delivery.
 */
export default function Scene10_Vision() {
    const [email, setEmail] = useState("");
    const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
    const [statusMessage, setStatusMessage] = useState("");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!email.trim() || submissionState === "sending") return;

        setSubmissionState("sending");
        setStatusMessage("");

        try {
            const response = await fetch("/api/beta/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
            const result = (await response.json()) as BetaEmailResponse;

            if (!response.ok) {
                setSubmissionState("error");
                setStatusMessage(
                    response.status === 429
                        ? "Too many requests from this connection. Please wait before trying again."
                        : result.error === "invalid-email"
                            ? "Enter a valid email address."
                            : "We could not process that request. Please try again.",
                );
                return;
            }

            if (result.sent) {
                setSubmissionState("sent");
                return;
            }

            if (result.stored) {
                setSubmissionState("stored");
                setStatusMessage(
                    "Your request was saved, but the access email was not delivered. Try again or email hello@frederickradius.app.",
                );
                return;
            }

            setSubmissionState("error");
            setStatusMessage("We could not save the request. Please try again or email hello@frederickradius.app.");
        } catch {
            setSubmissionState("error");
            setStatusMessage("The request could not reach the server. Check your connection and try again.");
        }
    };

    return (
        <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-gradient-to-b from-[#030014] via-[#0a0118] to-[#0f0520] px-8 py-28">
            <motion.div
                className="absolute inset-0 opacity-20"
                initial={{ scale: 1.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 0.2 }}
                transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="h-full w-full bg-gradient-to-b from-violet-950/40 via-purple-950/30 to-transparent" />
            </motion.div>

            <div className="relative z-10 w-full max-w-4xl text-center">
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                    className="mb-10"
                >
                    <p className="mb-4 text-sm font-medium uppercase tracking-[0.28em] text-violet-300">
                        Independent private beta
                    </p>
                    <h1 className="mb-6 text-6xl font-light leading-none tracking-tight text-white md:text-8xl">
                        Find what fits
                        <br />
                        <GradientText>your Frederick day</GradientText>
                    </h1>
                    <p className="mx-auto max-w-3xl text-xl font-light leading-relaxed text-gray-400 md:text-2xl">
                        Frederick Radius is a working local-discovery beta. The goal is simple: make places, events, and useful updates easier to find and easier to trust.
                    </p>
                </motion.div>

                {submissionState === "sent" ? (
                    <motion.div
                        className="mx-auto mb-12 max-w-2xl rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-8 backdrop-blur-xl"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        role="status"
                    >
                        <div className="mb-4 flex items-center justify-center">
                            <div className="rounded-full bg-gradient-to-br from-green-500 to-emerald-600 p-3">
                                <Check className="h-8 w-8 text-white" aria-hidden="true" />
                            </div>
                        </div>
                        <h2 className="mb-2 text-3xl font-semibold text-white">Access email accepted</h2>
                        <p className="text-gray-300">
                            Check your inbox for a personal beta code. If it does not arrive, email{" "}
                            <a className="text-emerald-200 underline underline-offset-4" href="mailto:hello@frederickradius.app">
                                hello@frederickradius.app
                            </a>
                            .
                        </p>
                    </motion.div>
                ) : (
                    <motion.form
                        onSubmit={handleSubmit}
                        className="relative mx-auto mb-12 max-w-2xl"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 1 }}
                    >
                        <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 opacity-30 blur-2xl" />

                        <div className="relative flex flex-col gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center">
                            <label htmlFor="pitch-beta-email" className="sr-only">Email address for beta access</label>
                            <Mail className="ml-3 hidden h-6 w-6 shrink-0 text-gray-400 sm:block" aria-hidden="true" />
                            <input
                                id="pitch-beta-email"
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="Email for a personal access code"
                                required
                                autoComplete="email"
                                disabled={submissionState === "sending"}
                                className="min-w-0 flex-1 bg-transparent px-3 py-4 text-lg text-white outline-none placeholder:text-gray-500 disabled:opacity-60"
                            />
                            <motion.button
                                type="submit"
                                disabled={submissionState === "sending"}
                                className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-purple-500 to-amber-500 px-7 py-4 font-semibold text-white shadow-lg disabled:cursor-wait disabled:opacity-60"
                                whileHover={submissionState === "sending" ? undefined : { scale: 1.03 }}
                                whileTap={submissionState === "sending" ? undefined : { scale: 0.97 }}
                            >
                                {submissionState === "sending" ? (
                                    <>
                                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                                        Sending…
                                    </>
                                ) : (
                                    <>
                                        {submissionState === "stored" ? "Try email again" : "Request beta access"}
                                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                                    </>
                                )}
                            </motion.button>
                        </div>

                        <p className="mt-4 text-sm text-gray-500">
                            Current phase: private beta. Confirmation appears only after the server accepts the access email for delivery.
                        </p>
                        <p className="mt-2 text-xs text-gray-600">
                            Your email is used to process beta access. By submitting, you agree to the{" "}
                            <a href="/terms" className="underline underline-offset-4 transition-colors hover:text-gray-300">Terms</a>
                            {" "}and acknowledge the{" "}
                            <a href="/privacy" className="underline underline-offset-4 transition-colors hover:text-gray-300">Privacy notice</a>.
                        </p>

                        {statusMessage ? (
                            <div
                                className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-left text-sm ${submissionState === "stored"
                                    ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
                                    : "border-red-300/20 bg-red-300/10 text-red-100"
                                    }`}
                                role="alert"
                            >
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{statusMessage}</span>
                            </div>
                        ) : null}
                    </motion.form>
                )}

                <motion.div
                    className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 1 }}
                >
                    {[
                        { value: "Independent", label: "Project" },
                        { value: "Local-first", label: "Focus" },
                        { value: "Private beta", label: "Current stage" },
                    ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
                            <div className="mb-1 text-2xl font-light text-white">{item.value}</div>
                            <div className="text-xs uppercase tracking-wider text-gray-500">{item.label}</div>
                        </div>
                    ))}
                </motion.div>

                <motion.footer
                    className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-500"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.5, duration: 1 }}
                >
                    <span>© 2026 Frederick Radius</span>
                    <span aria-hidden="true">·</span>
                    <a href="/terms" className="transition-colors hover:text-white">Terms</a>
                    <a href="/privacy" className="transition-colors hover:text-white">Privacy</a>
                    <span aria-hidden="true">·</span>
                    <span>Independent of local government</span>
                </motion.footer>
            </div>

            <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-[#030014] to-transparent" />
        </div>
    );
}
