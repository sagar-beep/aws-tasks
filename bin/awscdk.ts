#!/usr/bin/env node
// dotenv should be the first import always
import { config } from "dotenv";
config({});
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EventCenterStack } from "../lib/event-center-stack";

const app = new cdk.App();
// new EventFetcherStack(app, "HH1EventFetcherStack", {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });
// new SchemaFetcherStack(app, "HH1SchemaFetcherStack", {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
// });
new EventCenterStack(app, process.env.EVENT_CENTER_STACK_NAME || "HH1", {});
