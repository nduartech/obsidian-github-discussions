export const SEARCH_POSTS_QUERY : string = `
  query ($query: String!, $limit: Int!, $after: String) {
    search(query: $query, type: DISCUSSION, first: $limit, after: $after) {
      pageInfo {
        startCursor
        hasNextPage
        endCursor
      }
      edges {
        cursor
        node {
          ... on Discussion {
            id
            url
            number
            title
            body
            createdAt
            updatedAt
            category {
                id
                name
                description
            }
            author {
              avatarUrl
              login
              url
            }
            labels(first: 10) {
              edges {
                node {
                  id
                  name
                  description
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const CREATE_DISCUSSION_MUTATION = `
  mutation CreateDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
    createDiscussion(input: {
      repositoryId: $repositoryId,
      categoryId: $categoryId,
      title: $title,
      body: $body
    }) {
      discussion {
        id
        number
      }
    }
  }
`;

export const UPDATE_DISCUSSION_MUTATION = `
  mutation UpdateDiscussion($discussionId: ID!, $title: String!, $body: String!) {
    updateDiscussion(input: {
      discussionId: $discussionId,
      title: $title,
      body: $body
    }) {
      discussion {
        id
        number
      }
    }
  }
`;

export const CREATE_LABEL_MUTATION = `
  mutation CreateLabel($repositoryId: ID!, $name: String!, $description: String, $color: String!) {
    createLabel(input: {
      repositoryId: $repositoryId,
      name: $name,
      description: $description,
      color: $color
    }) {
      label {
        id
        name
      }
    }
  }
`;

export const ADD_LABELS_TO_DISCUSSION = `
  mutation AddLabelsToDiscussion($labelableId: ID!, $labelIds: [ID!]!) {
    addLabelsToLabelable(input: {
      labelableId: $labelableId,
      labelIds: $labelIds
    }) {
      labelable {
        labels(first: 100) {
          nodes {
            id
            name
          }
        }
      }
    }
  }
`;

export const GET_REPOSITORY_INFO = `
  query GetRepositoryInfo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      discussionCategories(first: 100) {
        nodes {
          id
          name
        }
      }
      labels(first: 100) {
        nodes {
          id
          name
        }
      }
    }
  }
`;
