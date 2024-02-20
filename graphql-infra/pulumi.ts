import * as aws from '@pulumi/aws';
import * as docker from '@pulumi/docker';
import * as pulumi from '@pulumi/pulumi';

const albAllowInboundFromAnywhere = new aws.ec2.SecurityGroup(
  'alb-allow-inbound-from-anywhere',
  {
    name: 'alb-allow-inbound-from-anywhere',
    description: 'Application load balancer allow traffic from anywhere',
    ingress: [
      {
        // Allow inbound HTTP traffic from any IP address
        protocol: 'TCP',
        cidrBlocks: ['0.0.0.0/0'],
        fromPort: 80,
        toPort: 80,
      },
    ],
    egress: [
      // Allow outbound traffic to any destination
      {
        protocol: '-1',
        cidrBlocks: ['0.0.0.0/0'],
        fromPort: 0,
        toPort: 0,
      },
    ],
  }
);

const graphqlEcsClusterAllowAlbInboundOnly = new aws.ec2.SecurityGroup(
  'graphql-ecs-allow-alb-inbound',
  {
    name: 'graphql-ecs-allow-alb-inbound',
    description: 'Graphql ECS cluster allow inbound from ALB',
    ingress: [
      // Allow inbound traffic only from the ALB
      {
        protocol: 'TCP',
        fromPort: 0,
        toPort: 65535,
        securityGroups: [albAllowInboundFromAnywhere.id],
      },
    ],
    egress: [
      // Allow outbound traffic to any destination
      {
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
  }
);

const repository = new aws.ecr.Repository('graphql-repository', {
  imageTagMutability: 'MUTABLE',
  forceDelete: true,
});

const repoCredentials = repository.registryId.apply(async (registryId) => {
  const credentials = await aws.ecr.getCredentials({
    registryId: registryId,
  });
  const decodedCredentials = Buffer.from(
    credentials.authorizationToken,
    'base64'
  ).toString();
  const [username, password] = decodedCredentials.split(':');
  return { server: credentials.proxyEndpoint, username, password };
});
const graphqlImage = new docker.Image('graphql-image', {
  imageName: pulumi.interpolate`${repository.repositoryUrl}:latest`,
  registry: repoCredentials,
  build: {
    context: '../',
    dockerfile: '../graphql/Dockerfile',
    platform: 'linux/amd64',
    args: {
      NODE_ENV: 'production',
      PORT: '8000',
      BUILD_FLAG: '--production',
    },
    cacheFrom: {
      images: [pulumi.interpolate`${repository.repositoryUrl}:latest`],
    },
  },
});
