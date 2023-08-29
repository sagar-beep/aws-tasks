import { Stack, StackProps, NestedStack, NestedStackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { EventPayloadEnricherStack } from "./event-payload-enricher-stack";
import { EventIdentifierStack } from "./event-identifier-stack";

export class EventCenterStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    new EventCenterNestedStack(this, "HHEventCenter", {});
  }
}

class EventCenterNestedStack extends NestedStack {
  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);
    new EventPayloadEnricherStack(
      this,
      process.env.PAYLOAD_ENRICHER_STACK_NAME || "EventPayloadEnricher",
      {
        env: {
          account: process.env.CDK_DEFAULT_ACCOUNT,
          region: process.env.CDK_DEFAULT_REGION,
        },
      }
    );
    new EventIdentifierStack(this, "EventIdentifier", {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
      },
    });
  }
}
