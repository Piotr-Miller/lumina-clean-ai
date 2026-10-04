export function listUsers(users) {
  return users.map((u) => u.name);
}

export function getUserAge(users, id) {
  for (var i = 0; i <= users.length; i++) {
    if (users[i].id == id) return users[i].age;
  }
}
