import * as awsx from '@pulumi/awsx';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

// Create a VPC with a custom CIDR block range
const vpc = new aws.ec2.Vpc('my-custom-vpc', {
  cidrBlock: '10.0.0.0/16',
  tags: {
    Name: 'my-custom-vpc',
  },
});

// Create an Internet Gateway and attach it to the VPC
const internetGateway = new aws.ec2.InternetGateway('my-internet-gateway', {
  vpcId: vpc.id,
  tags: {
    Name: 'my-internet-gateway',
  },
});

// Create the two public subnets and routing table rules
const publicSubnetOne = new aws.ec2.Subnet('public-subnet-1', {
  vpcId: vpc.id,
  cidrBlock: '10.0.0.0/24',
  availabilityZone: aws
    .getAvailabilityZones({
      state: 'available',
    })
    .then((zones) => zones.names[0]),
  tags: {
    Name: 'public-subnet-1',
  },
});
const publicSubnetTwo = new aws.ec2.Subnet('public-subnet-2', {
  vpcId: vpc.id,
  cidrBlock: '10.0.1.0/24',
  availabilityZone: aws
    .getAvailabilityZones({
      state: 'available',
    })
    .then((zones) => zones.names[1]),
  tags: {
    Name: 'public-subnet-2',
  },
});
[publicSubnetOne, publicSubnetTwo].map((subnet, index) => {
  const subNetRoutingTable = new aws.ec2.RouteTable(
    `public-subnet-${index + 1}-route-table`,
    {
      vpcId: vpc.id,
      routes: [
        { cidrBlock: '0.0.0.0/0', gatewayId: internetGateway.id },
        {
          cidrBlock: vpc.cidrBlock,
          gatewayId: 'local',
        },
      ],
      tags: {
        Name: `public-subnet-${index + 1}-route-table`,
      },
    }
  );
  new aws.ec2.RouteTableAssociation(
    `public-subnet-${index + 1}-route-table-association`,
    {
      subnetId: subnet.id,
      routeTableId: subNetRoutingTable.id,
    }
  );
});

// Create two NAT Gateways each in a public subnet with an allocated Elastic IP
const natGatewayOneElasticIp = new aws.ec2.Eip(
  'public-subnet-1-nat-gateway-eip',
  {
    tags: {
      Name: 'public-subnet-1-nat-gateway-eip',
    },
  }
);
const publicSubnetOneNatGateway = new aws.ec2.NatGateway(
  'public-subnet-1-nat-gateway',
  {
    allocationId: natGatewayOneElasticIp.allocationId,
    subnetId: publicSubnetOne.id,
    connectivityType: 'public',
    tags: {
      Name: 'public-subnet-1-nat-gateway',
    },
  }
);
const natGatewayTwoElasticIp = new aws.ec2.Eip(
  'public-subnet-2-nat-gateway-eip',
  {
    tags: {
      Name: 'public-subnet-2-nat-gateway-eip',
    },
  }
);
const publicSubnetTwoNatGateway = new aws.ec2.NatGateway(
  'public-subnet-2-nat-gateway',
  {
    allocationId: natGatewayTwoElasticIp.allocationId,
    subnetId: publicSubnetTwo.id,
    connectivityType: 'public',
    tags: {
      Name: 'public-subnet-2-nat-gateway',
    },
  }
);

// Create the two private subnets and routing table rules
const privateSubnetOne = new aws.ec2.Subnet('private-subnet-1', {
  vpcId: vpc.id,
  cidrBlock: '10.0.10.0/24',
  availabilityZone: aws
    .getAvailabilityZones({
      state: 'available',
    })
    .then((zones) => zones.names[0]),
  tags: {
    Name: 'private-subnet-1',
  },
});
const privateSubnetTwo = new aws.ec2.Subnet('private-subnet-2', {
  vpcId: vpc.id,
  cidrBlock: '10.0.11.0/24',
  availabilityZone: aws
    .getAvailabilityZones({
      state: 'available',
    })
    .then((zones) => zones.names[1]),
  tags: {
    Name: 'private-subnet-2',
  },
});
const publicNatGateways: aws.ec2.NatGateway[] = [
  publicSubnetOneNatGateway,
  publicSubnetTwoNatGateway,
];
[privateSubnetOne, privateSubnetTwo].map((subnet, index) => {
  const subNetRoutingTable = new aws.ec2.RouteTable(
    `private-subnet-${index + 1}-route-table`,
    {
      vpcId: vpc.id,
      routes: [
        { cidrBlock: '0.0.0.0/0', gatewayId: publicNatGateways[index].id },
        {
          cidrBlock: vpc.cidrBlock,
          gatewayId: 'local',
        },
      ],
      tags: {
        Name: `private-subnet-${index + 1}-route-table`,
      },
    }
  );
  new aws.ec2.RouteTableAssociation(
    `private-subnet-${index + 1}-route-table-association`,
    {
      subnetId: subnet.id,
      routeTableId: subNetRoutingTable.id,
    }
  );
});

const albAllowAllIpTrafficSecurityGroup = new aws.ec2.SecurityGroup(
  'alb-all-traffic-sg',
  {
    vpcId: vpc.id,
    ingress: [
      {
        protocol: 'TCP',
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
    egress: [
      {
        protocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ['0.0.0.0/0'],
      },
    ],
  }
);
const restApiAlb = new aws.lb.LoadBalancer('rest-api-lb', {
  internal: false,
  loadBalancerType: 'application',
  ipAddressType: 'ipv4',
  securityGroups: [albAllowAllIpTrafficSecurityGroup.id],
  subnets: [publicSubnetOne.id, publicSubnetTwo.id],
});

// Target group for ECS tasks
const imagePort = 80;
const albEcsClusterTargetGroup = new aws.lb.TargetGroup(
  'alb-ecs-cluster-target',
  {
    vpcId: vpc.id,
    protocol: 'HTTP',
    port: imagePort,
    targetType: 'ip',
  }
);

// Listener for the ALB to route incoming traffic to the target group
const albListener = new aws.lb.Listener('alb-http-listener', {
  loadBalancerArn: restApiAlb.arn,
  port: 80,
  defaultActions: [
    {
      type: 'forward',
      targetGroupArn: albEcsClusterTargetGroup.arn,
    },
  ],
});

const restApiCluster = new aws.ecs.Cluster('rest-api-cluster');
const restApiRepository = new aws.ecr.Repository('rest-api-repository', {
  forceDelete: true,
});
const restApiImage = new awsx.ecr.Image('rest-api-image', {
  repositoryUrl: restApiRepository.repositoryUrl,
  context: '../',
  dockerfile: '../rest-api/Dockerfile',
  platform: 'linux/amd64',
  args: {
    NODE_ENV: 'production',
    PORT: `${imagePort}`,
    BUILD_FLAG: '--production',
  },
});

new awsx.ecs.FargateService('rest-api-fargate-service', {
  cluster: restApiCluster.arn,
  desiredCount: 2,
  networkConfiguration: {
    subnets: [privateSubnetOne.id, privateSubnetTwo.id],
    securityGroups: [albAllowAllIpTrafficSecurityGroup.id],
  },
  loadBalancers: [
    {
      targetGroupArn: albEcsClusterTargetGroup.arn,
      containerName: 'api',
      containerPort: 80,
    },
  ],
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
          containerPort: imagePort,
          protocol: 'TCP',
        },
      ],
    },
  },
});

export const URL = pulumi.interpolate`http://${restApiAlb.dnsName}`;
