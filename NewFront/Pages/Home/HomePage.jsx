import { Button, Container, Text, Title } from '@mantine/core';
import classes from './homestyle.module.css';

const HomePage = () => {
  return (
    <div className={classes.root}>
      <Container size="lg">
        <div className={classes.inner}>
          <div className={classes.content}>
            <Title className={classes.title}>
              {' '}
              <Text
                component="span"
                inherit
                variant="gradient"
                gradient={{ from: 'green', to: 'blue' }}
              >
                SEC-Wrapper
              </Text>{' '}              
            </Title>
            <Title className={classes.title}>
              AI Business Intelligence
            </Title>

            <Text className={classes.description} mt={30}>
              Historical information directly from the SEC at your fingertips - for business and financial professionals who are looking for technical reporting and interpretation by artifical intelligence they can trust
            </Text>

            <Button
              variant="gradient"
              gradient={{ from: 'green', to: 'blue' }}
              size="xl"
              className={classes.control}
              mt={40}
            >
              Get started
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}

export default HomePage;