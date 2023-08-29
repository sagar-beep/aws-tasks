import { Stack, StackProps, Duration, CfnOutput } from "aws-cdk-lib";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Role } from "aws-cdk-lib/aws-iam";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class EventFetcherStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create an SQS queue

    const queue = new Queue(this, "hh1EventFetcherQueue", {
      visibilityTimeout: Duration.seconds(300), // Adjust timeout as per your requirement
    });

    // Create a Lambda function
    const lambdaFn = new Function(this, "hhEventFetcher", {
      runtime: Runtime.NODEJS_18_X,

      code: Code.fromAsset("../event-fetcher/dist/."),

      handler: "lambda.handler",

      environment: {
        QUEUE_URL: queue.queueUrl,
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
          "sg-066b6240e7e686b3d"
        ),
      ],
      vpc: Vpc.fromVpcAttributes(this, "vpcId", {
        vpcId: "vpc-072beb706b4d032c1",
        availabilityZones: ["us-east-1a", "us-east-1b"],
        privateSubnetIds: [
          "subnet-0eaf79b5bba81fd5a",
          "subnet-095f890691954b1e3",
          "subnet-00cf3ccb8af53bac4",
          "subnet-0b83104475fb2d53a",
        ],
      }),
    });

    // Grant necessary permissions to Lambda to send messages to the queue

    queue.grantSendMessages(lambdaFn);
    lambdaFn.addEventSource(new SqsEventSource(queue));

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
      "MySecret",
      "my-secret-name"
    );
    // Grant the Lambda function permission to access the secret
    mySecret.grantRead(lambdaFn);
  }
}
