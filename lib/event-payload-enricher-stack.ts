import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { Role } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { getVPC } from "./util/deploymentUtil";

export class EventPayloadEnricherStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const eventPayloadDeadLetterQueue = new Queue(
      this,
      "hh1EventPayloadEnricherDeadLetterQueue",
      {
        fifo: true,
        contentBasedDeduplication: true,
      }
    );
    // Create an SQS queue
    const eventPayloadEnricherQueue = new Queue(
      this,
      "hhEventPayloadEnricherQueue",
      {
        visibilityTimeout: Duration.seconds(300),
        fifo: true,
        contentBasedDeduplication: true,
        retentionPeriod: Duration.seconds(21600),
        deadLetterQueue: {
          queue: eventPayloadDeadLetterQueue,
          maxReceiveCount: 2,
        },
      }
    );

    // Create a Lambda function
    const lambdaFn = new Function(this, "hhEventPayloadEnricher", {
      runtime: Runtime.NODEJS_18_X,
      code: Code.fromAsset("../event-payload-enricher/."),
      handler: "index.handler",
      environment: {
        QUEUE_URL: eventPayloadEnricherQueue.queueUrl,
        DB_SECRET_KEY:
          process.env.EVENT_FETCHER_DB_SECRET_KEY || "eventsCoreDB",
        REGION: process.env.CDK_DEFAULT_REGION || "us-east-1",
        env: process.env.ENV || "dev",
      },
      role: Role.fromRoleArn(
        this,
        "execution-role",
        "arn:aws:iam::866159464259:role/lambda-NG2-PortalConfig-Role"
      ),
      securityGroups: [
        SecurityGroup.fromLookupById(
          this,
          "hhSecurityGroupId",
          process.env.SECUIRTY_GROUP_ID || ""
        ),
      ],
      vpc: getVPC(this, "vpcId"),
    });

    lambdaFn.addEventSource(
      new SqsEventSource(eventPayloadEnricherQueue, {
        batchSize: 5,
        enabled: true,
      })
    );

    const eventPayloadEnricherQueueName =
      id + "-EventPayloadEnricherQueueArnExport";
    console.log(
      "eventPayloadEnricherQueueName: ",
      eventPayloadEnricherQueueName
    );

    new CfnOutput(this, "EventPayloadEnricherQueueArn", {
      value: eventPayloadEnricherQueue.queueArn,
      description: "event payload enricher queue",
      exportName: eventPayloadEnricherQueueName,
    });
    const mySecret = Secret.fromSecretNameV2(
      this,
      "MySecret",
      "my-secret-name"
    );
    mySecret.grantRead(lambdaFn);

    Bucket.fromBucketName(
      this,
      "eventPayloadBucket",
      "v3locitydev-eventslambda"
    ).grantRead(lambdaFn);
  }
}
