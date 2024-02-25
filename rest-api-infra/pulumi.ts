import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';

const restApiCluster = new awsx.classic.ecs.Cluster('rest-api-cluster');
const restApiAlb = new awsx.lb.ApplicationLoadBalancer('rest-api-lb');

const imagePort = 80;
const restApiRepository = new awsx.ecr.Repository('rest-api-repository', {
  forceDelete: true,
});
const restApiImage = new awsx.ecr.Image('rest-api-image', {
  repositoryUrl: restApiRepository.repository.repositoryUrl,
  context: '../',
  dockerfile: '../rest-api/Dockerfile',
  platform: 'linux/amd64',
  args: {
    NODE_ENV: 'production',
    PORT: `${imagePort}`,
    BUILD_FLAG: '--production',
  },
});

const restApiService = new awsx.ecs.FargateService('rest-api-fargate-service', {
  cluster: restApiCluster.cluster.arn,
  assignPublicIp: true,
  desiredCount: 2,
  taskDefinitionArgs: {
    container: {
      name: 'api',
      image: restApiImage.imageUri,
      cpu: 128,
      memory: 512,
      essential: true,
      environment: [{ name: 'PORT', value: `${imagePort}` }],
      portMappings: [
        {
          containerPort: 80,
          targetGroup: restApiAlb.defaultTargetGroup,
        },
      ],
    },
  },
});
export const url = pulumi.interpolate`http://${restApiAlb.loadBalancer.dnsName}`;
