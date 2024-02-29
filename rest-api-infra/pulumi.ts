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

// Create the security groups for the network and application load balancer
const nlbSecurityGroup = new aws.ec2.SecurityGroup('nlb-security-group', {
  description: 'Allow subnet level traffic for the nlb',
  vpcId: vpc.id,
  ingress: [
    // {
    //   fromPort: 80,
    //   toPort: 80,
    //   protocol: 'tcp',
    //   cidrBlocks: ['0.0.0.0/0'],
    // },
    {
      // local traffic within the subnet
      fromPort: 80,
      toPort: 80,
      protocol: 'TCP',
      cidrBlocks: [vpc.cidrBlock],
    },
  ],
  egress: [
    { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
  ],
});
const albSecurityGroup = new aws.ec2.SecurityGroup('alb-security-group', {
  description: 'Allow subnet level and nlb traffic for the alb',
  vpcId: vpc.id,
  ingress: [
    {
      // local traffic within the subnet
      fromPort: 80,
      toPort: 80,
      protocol: 'TCP',
      cidrBlocks: [vpc.cidrBlock],
    },
    {
      // traffic from the network load balancer
      fromPort: 80,
      toPort: 80,
      protocol: 'TCP',
      securityGroups: [nlbSecurityGroup.id],
    },
  ],
  egress: [
    { protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] },
  ],
});

// Create application load balancer and port 80 listener
const restApiAlb = new aws.lb.LoadBalancer('rest-api-alb', {
  loadBalancerType: 'application',
  internal: true,
  subnets: [privateSubnetOne.id, privateSubnetTwo.id],
  securityGroups: [albSecurityGroup.id],
});
const defaultAlbTargetGroup = new aws.lb.TargetGroup(
  'default-alb-target-group',
  {
    vpcId: vpc.id,
    protocol: 'HTTP',
    port: 80,
    targetType: 'ip',
  }
);
new aws.lb.Listener('alb-listener', {
  port: 80,
  protocol: 'HTTP',
  loadBalancerArn: restApiAlb.arn,
  defaultActions: [
    {
      type: 'forward',
      targetGroupArn: defaultAlbTargetGroup.arn,
    },
  ],
});

// Create an application load balancer target group and attachment which allows
// the network load balancer to route tcp traffic to the application load balancer.
const albNlbTargetGroup = new aws.lb.TargetGroup('alb-nlb-target-group', {
  vpcId: vpc.id,
  protocol: 'TCP',
  port: 80,
  targetType: 'alb',
});
new aws.lb.TargetGroupAttachment('alb-nlb-target-group-attachment', {
  targetGroupArn: albNlbTargetGroup.arn,
  targetId: restApiAlb.id,
  port: 80,
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
    PORT: '80',
    BUILD_FLAG: '--production',
  },
});
new awsx.ecs.FargateService('rest-api-fargate-service', {
  cluster: restApiCluster.arn,
  desiredCount: 2,
  networkConfiguration: {
    subnets: [privateSubnetOne.id, privateSubnetTwo.id],
    securityGroups: [albSecurityGroup.id],
  },
  loadBalancers: [
    {
      targetGroupArn: defaultAlbTargetGroup.arn,
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
      environment: [{ name: 'PORT', value: '80' }],
      portMappings: [
        {
          containerPort: 80,
          protocol: 'TCP',
        },
      ],
    },
  },
});

const restApiNlb = new aws.lb.LoadBalancer('rest-api-nlb', {
  internal: true,
  loadBalancerType: 'network',
  securityGroups: [nlbSecurityGroup.id],
  enableCrossZoneLoadBalancing: true,
  subnets: [privateSubnetOne.id, privateSubnetTwo.id],
});

new aws.lb.Listener('nlb-listener', {
  port: 80,
  protocol: 'TCP',
  loadBalancerArn: restApiNlb.arn,
  defaultActions: [
    {
      type: 'forward',
      targetGroupArn: albNlbTargetGroup.arn,
    },
  ],
});

export const NlbURL = pulumi.interpolate`http://${restApiNlb.dnsName}`;
