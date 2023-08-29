import { Stack, StackProps, Duration, CfnOutput, Fn } from "aws-cdk-lib";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { SubscriptionFilter, Topic } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { getVPC } from "./util/deploymentUtil";

export class EventIdentifierStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const eventPayloadQueueImportName =
      process.env.PAYLOAD_ENRICHER_STACK_NAME +
      "-EventPayloadEnricherQueueArnExport";
    console.log("eventPayloadQueueImportName: ", eventPayloadQueueImportName);
    const eventPayloadEnricherQueue = Queue.fromQueueArn(
      this,
      "eventPayloadQueue",
      Fn.importValue(eventPayloadQueueImportName)
    );

    new CfnOutput(this, "eventPayloadQueueOutput", {
      value: eventPayloadEnricherQueue.queueArn,
      description: "got Queue from event payload",
    });
    // Create a Lambda function
    const lambdaFn = new Function(this, "hhEventIdentifier", {
      runtime: Runtime.NODEJS_18_X,

      code: Code.fromAsset("../event-identifier/."),

      handler: "index.handler",

      environment: {
        QUEUE_URL: eventPayloadEnricherQueue.queueUrl,
        DB_SECRET_KEY:
          process.env.EVENT_FETCHER_DB_SECRET_KEY || "eventsCoreDB",
        REGION: process.env.CDK_DEFAULT_REGION || "us-east-1",
        env: process.env.ENV || "dev",
      },
      securityGroups: [
        SecurityGroup.fromLookupById(
          this,
          "hhSecurityGroupId",
          process.env.SECUIRTY_GROUP_ID || ""
        ),
      ],
      vpc: getVPC(this, "vpcId"),
    });

    const hhEventPayloadEnricherDeadLetterQueue = new Queue(
      this,
      "hh1EventIdentifierDeadLetterQueue",
      {
        fifo: true,
        contentBasedDeduplication: true,
      }
    );
    // Create an SQS queue
    const eventIdentifierQueue = new Queue(this, "hh1EventIdentifierQueue", {
      visibilityTimeout: Duration.seconds(300),
      fifo: true,
      contentBasedDeduplication: true,
      retentionPeriod: Duration.seconds(21600),
      deadLetterQueue: {
        queue: hhEventPayloadEnricherDeadLetterQueue,
        maxReceiveCount: 2,
      },
    });
    lambdaFn.addEventSource(new SqsEventSource(eventIdentifierQueue));

    const SNSTopic = Topic.fromTopicArn(
      this,
      "SNSTopic",
      `arn:aws:sns:${process.env.CDK_DEFAULT_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:v3locitydev_business_events.fifo`
    );

    SNSTopic.addSubscription(
      new SqsSubscription(eventIdentifierQueue, {
        filterPolicy: {
          environment: SubscriptionFilter.stringFilter({
            allowlist: ["harieventdev"],
          }),
        },
      })
    );
    eventPayloadEnricherQueue.grantSendMessages(lambdaFn);

    // Create an API Gateway REST API

    const api = new RestApi(this, "hhApi", {
      restApiName: "hh  API",
      description: "API Gateway endpoint for the Lambda function",
    });

    // Create an integration between the API Gateway and Lambda function

    const lambdaIntegration = new LambdaIntegration(lambdaFn);

    const apiResource = api.root.addResource("{proxy+}");

    apiResource.addMethod("ANY", lambdaIntegration);

    // Output the API Gateway endpoint URL

    new CfnOutput(this, "hhApiEndpointOutput", {
      value: api.url,
      description: "hh API Gateway endpoint URL",
    });
    // Retrieve the secret from AWS Secrets Manager
    const mySecret = Secret.fromSecretNameV2(
      this,
      "EventIdentifierSecret",
      "eventscenter-bendev"
    );
    // Grant the Lambda function permission to access the secret
    mySecret.grantRead(lambdaFn);
  }
}
